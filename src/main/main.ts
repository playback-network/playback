import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut } from 'electron';
import path from 'node:path';
import { initializeDatabase } from '../db/db';
import { performOCRAndRedact } from '../services/ocr_service'; // Corrected import path
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

function createWindow() {
  const isProd = app.isPackaged;
  const iconPath = isProd
    ? path.join(process.resourcesPath, 'assets', 'PlaybackIcon.icns')
    : path.join(fileURLToPath(new URL('.', import.meta.url)), '../assets/logo.png');
  console.log('iconPath', iconPath);

  const preloadPath = isProd
  ? path.join(process.resourcesPath, 'preload', 'index.js')
  : path.join(__dirname, '../preload/index.js');
  mainWindow = new BrowserWindow({
    width: 360,
    height: 440,
    frame: false,
    resizable: false,
    transparent: true,
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
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools();
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
    });
  } else {
    // This shouldn't run in dev mode
    const indexHtml = path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
    console.log('Loading from:', indexHtml);
    mainWindow.loadFile(indexHtml);
  }

  userEventEmitter.on('user-event', (event) => {
    handleUserEvent(event, mainWindow);
  });

  // For debugging
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.on('blur', () => {
    mainWindow?.hide();
  });
}

function toggleWindow(bounds) {
  if (!mainWindow) return;

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    const { x, y, width } = bounds;
    const windowBounds = mainWindow.getBounds();

    const newX = Math.round(x + width / 2 - windowBounds.width / 2);
    const newY = Math.round(y + 4); // adjust for status bar height

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

function createTray() {
  const isProd = app.isPackaged;
  const iconPath = isProd
    ? path.join(process.resourcesPath, 'assets', 'PbTemplate.png')
    : path.join(fileURLToPath(new URL('.', import.meta.url)), '../assets/PbTemplate.png');
    console.log('iconPath', iconPath);
  
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    console.error('[tray] tray icon failed to load');
  }
  icon.setTemplateImage(true); // **CRITICAL** for mac tray icons
  icon = icon.resize({ width: 18, height: 18 }); // <- this helps with overflow

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

  tray.on('click', (_event, bounds) => {
    toggleWindow(bounds);
  });
}

app.whenReady().then(async () => {
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
  createWindow();
  createTray();
  startMonitoring();

  // global shortcut for mac
  globalShortcut.register('CommandOrControl+P', () => {
    if (!mainWindow) return;
  
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      const bounds = tray?.getBounds(); // try to center under tray if available
      if (bounds) {
        toggleWindow(bounds);
      } else {
        // fallback: center on screen
        const { width, height } = mainWindow.getBounds();
        const { width: sw, height: sh } = require('electron').screen.getPrimaryDisplay().workAreaSize;
        mainWindow.setBounds({
          x: Math.round((sw - width) / 2),
          y: Math.round((sh - height) / 2),
          width,
          height,
        });
        mainWindow.show();
        mainWindow.focus();
      }
        }
  });
  
  log('session:initialized', { sessionId });
});

ipcMain.handle('redact-image', async (event, imageData: Buffer) => {
  try {
    const redactedImage = await performOCRAndRedact(imageData);
    return { status: 'success', redactedImage };
  } catch (error) {
    console.error('Error during redaction:', error);
    return { status: 'error', message: error.message };
  }
});

ipcMain.handle('db:getRedactedCount', async () => {
  const redactedCount = await getRedactedScreenshotCount();
  return redactedCount;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
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
process.once('exit', shutdown);
process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});