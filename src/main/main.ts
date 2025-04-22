import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
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
    ? path.join(process.resourcesPath, 'assets', 'icon.icns')
    : path.join(fileURLToPath(new URL('.', import.meta.url)), '../assets/icon.png');
  console.log('iconPath', iconPath);

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.js')
    },
    show: false
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // This shouldn't run in dev mode
    const indexHtml = path.join(__dirname, '../renderer/index.html');
    console.log('Loading from:', indexHtml);
    mainWindow.loadFile(indexHtml);
  }

  userEventEmitter.on('user-event', (event) => {
    handleUserEvent(event, mainWindow);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
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
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/logo.png');
  console.log('iconPath', iconPath);
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
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
  ]);

  tray.setToolTip('Playback App');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
}

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

// Initialize the database when the app starts
app.whenReady().then(async () => {
  const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env.production') // correct for macOS
  : path.resolve(__dirname, '../../.env');              // in dev

  const result = dotenv.config({ path: envPath });
  if (result.error) console.error('❌ dotenv error:', result.error);
  else console.log('✅ env loaded from:', envPath);
  getUserPool();
  log('app:start', { platform: process.platform, version: app.getVersion() });
  checkForUpdates();

  await initializeDatabase();
  const sessionId = await initializeSession();
  await setActiveSessionId(sessionId);
  createWindow();
  createTray();
  startMonitoring();
  log('session:initialized', { sessionId });
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
    await uploadAppLogs();
    log('app:logs:uploaded');
  } catch (err) {
    log('upload:fail', { error: err.message });
  } finally {
    shutdown(); 
    app.exit();
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