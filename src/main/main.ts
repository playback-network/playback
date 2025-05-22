import { systemPreferences, shell, app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, dialog, screen } from 'electron';
import path from 'node:path';
import { initializeDatabase } from '../db/db';
import { stopBackgroundProcesses, stopUploadLoop, userEventEmitter } from '../services/process_manager';
import { handleUserEvent } from '../services/capture_engine';
import { getRedactedScreenshotCount, initializeSession } from '../db/db_utils';
import { setActiveSessionId } from '../db/sessionStore';
import dotenv from 'dotenv';
import './auth';
import { getUserPool } from './auth';
import { startMonitoring } from './performance';
import { log } from '../services/logger';
import { uploadAppLogs } from '../db/db_s3_utils';
import { checkForUpdates } from './updater';
import { fileURLToPath } from 'url';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

async function shutdown() {
  if (isQuitting) return;
  isQuitting = true;
  log('app:shutdown:start');
  globalShortcut.unregisterAll();

  try {
    await stopUploadLoop();
    await uploadAppLogs();
    stopBackgroundProcesses();
    log('app:shutdown:complete');
  } catch (err) {
    log('shutdown:error', { error: err.message });
  } finally {
    app.quit(); // still needed to gracefully exit Electron
  }
}

function createWindow(bounds: Electron.Rectangle) {
  const isProd = app.isPackaged;
  const iconPath = isProd
    ? path.join(process.resourcesPath, 'icon.icns')
    : path.join(fileURLToPath(new URL('.', import.meta.url)), '../assets/logo.png');
  console.log('iconPath', iconPath);

  const preloadPath = isProd
  ? path.join(process.resourcesPath, 'preload', 'index.js')
  : path.join(__dirname, '../preload/index.js');
  console.log('[main] preload path:', preloadPath);
  const win = new BrowserWindow({
    width: 360,
    height: 440,
    frame: false,
    resizable: false,
    transparent: true,
    movable: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools();
    win.once('ready-to-show', () => {
      win?.show();
      win.focus();
    });
  } else {
    // This shouldn't run in dev mode
    const indexHtml = path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
    console.log('Loading from:', indexHtml);
    win.loadFile(indexHtml);
  }

  userEventEmitter.on('user-event', (event) => {
    handleUserEvent(event, win);
  });

  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) {
      win.hide();
    }
  });
  
  win.setVisibleOnAllWorkspaces(true);

  return win;
}

async function createTray() {
  const isProd = app.isPackaged;
  const iconPath = isProd
    ? path.join(process.resourcesPath, 'assets', 'logo24x24.png')
    : path.join(fileURLToPath(new URL('.', import.meta.url)), '../assets/logo24x24.png');
    console.log('iconPath', iconPath);
  
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    console.error('[tray] tray icon failed to load');
  }
  icon.setTemplateImage(true); // **CRITICAL** for mac tray icons
  icon = icon.resize({ width: 16, height: 16 }); // <- this helps with overflow

  tray = new Tray(icon);
  tray.setToolTip('Playback App');

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => mainWindow?.show(),
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ])
  );

  tray.on('click', async (_event) => {
    if (!mainWindow) {
      mainWindow = createWindow(await getTrayOrDefaultBounds());
    } else {
      toggleWindow();
    }
  });
}

async function requestAppPermissionsOnce() {
  interface PermissionResults {
    microphone: boolean;
    screen: boolean;
    accessibility: boolean;
  }

  const results: PermissionResults = {
    microphone: false,
    screen: false,
    accessibility: false
  };

  // Microphone
  if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
    results.microphone = await systemPreferences.askForMediaAccess('microphone');
  } else {
    results.microphone = true;
  }

  // Screen Recording
  results.screen = systemPreferences.getMediaAccessStatus('screen') === 'granted';
  if (!results.screen) {
    dialog.showMessageBoxSync({
      type: 'info',
      message: 'Screen Recording Permission Needed',
      detail: 'Please enable screen recording for Playback in System Preferences > Security & Privacy > Screen Recording. You may need to restart the app after enabling.',
      buttons: ['OK']
    });
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }

  // Accessibility
  results.accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  if (!results.accessibility) {
    dialog.showMessageBoxSync({
      type: 'info',
      message: 'Accessibility Permission Needed',
      detail: 'Please enable Accessibility for Playback in System Preferences > Security & Privacy > Accessibility. You may need to restart the app after enabling.',
      buttons: ['OK']
    });
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  }

  return results;
}

let hasInitializedTrayBounds = false;

async function getTrayOrDefaultBounds() {
  if (!hasInitializedTrayBounds) {
    hasInitializedTrayBounds = true;
    const { workArea } = screen.getPrimaryDisplay();
    return {
      x: workArea.x + workArea.width - 720, // right-aligned
      y: workArea.y + 24,                    // just under menu bar
      width: 360,
      height: 440
    };
  }

  if (tray) {
    for (let i = 0; i < 10; i++) {
      const trayBounds = tray.getBounds();
      if (trayBounds.width > 0 && trayBounds.height > 0) {
        return {
          x: Math.round(trayBounds.x + trayBounds.width / 2 - 180),
          y: Math.round(trayBounds.y + trayBounds.height + 4),
          width: 360,
          height: 440
        };
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - 360,
    y: workArea.y + 24,
    width: 360,
    height: 440
  };
}

async function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    const bounds = await getTrayOrDefaultBounds();
    const windowBounds = mainWindow.getBounds();
    let newX, newY;
    if (tray && bounds.width < 100 && bounds.height < 100) {
      newX = Math.round(bounds.x + bounds.width / 2 - windowBounds.width / 2);
      newY = Math.round(bounds.y + bounds.height + 4);
    } else {
      newX = bounds.x;
      newY = bounds.y + 4;
    }
    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: windowBounds.width,
      height: windowBounds.height
    });
    mainWindow.show();
    mainWindow.focus();
  }
}

app.whenReady().then(async () => {
  const perms = await requestAppPermissionsOnce();

  //system settings
  if (app.isPackaged && process.platform === 'darwin') {
    const exePath = app.getPath('exe');
    console.log('[startup] setting login item path:', exePath);
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: exePath,
    });
  }

  if (process.platform === 'darwin') {
    app.dock.hide();
  }  

  // env
  const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env.production') // correct for macOS
  : path.resolve(__dirname, '../../.env');              // in dev

  const result = dotenv.config({ path: envPath });
  if (result.error) console.error('❌ dotenv error:', result.error);
  else console.log('✅ env loaded from:', envPath);
  
  // init
  getUserPool();
  checkForUpdates();
  log('app:start', { platform: process.platform, version: app.getVersion() });
  
  // initialize database
  await initializeDatabase();
  const sessionId = await initializeSession();
  await setActiveSessionId(sessionId);
  
  //boot
  await createTray();
  startMonitoring();

  const bounds = await getTrayOrDefaultBounds();
  mainWindow = createWindow(bounds);
  mainWindow.setBounds(bounds);
  mainWindow.show();
  mainWindow.focus();
  
  // global shortcut for mac
  globalShortcut.register('CommandOrControl+P', () => {
    toggleWindow();
  });
  
  log('session:initialized', { sessionId });
});

ipcMain.handle('db:getRedactedCount', async () => {
  const redactedCount = await getRedactedScreenshotCount();
  return redactedCount;
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (tray) mainWindow = createWindow(await getTrayOrDefaultBounds());
    mainWindow.show();
    mainWindow.focus(); 
  }
});

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  event.preventDefault(); // prevent default quit

  isQuitting = true;
  log('app:shutdown:start'); 
  try {
    await shutdown();
    log('app:shutdown:complete');
  } catch (err) {
    log('shutdown:error', { error: err.message });
  } finally {
    app.exit(0);
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

process.once('exit', shutdown);
process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});