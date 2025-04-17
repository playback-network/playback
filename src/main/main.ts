import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'node:path';
import { initializeDatabase } from '../db/db';
import { performOCRAndRedact } from '../services/ocr_service'; // Corrected import path
import { stopBackgroundProcesses, stopUploadLoop, userEventEmitter } from '../services/process_manager';
import { handleUserEvent } from '../services/capture_engine';
import { getRedactedScreenshotCount, initializeSession } from '../db/db_utils';
import { setActiveSessionId } from '../db/sessionStore';
import './auth';
import dotenv from 'dotenv';
import { startMonitoring } from './performance';
import { log } from '../services/logger';
import { uploadAppLogs } from '../db/db_s3_utils';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isProd = process.env.NODE_ENV === 'production';
const envPath = isProd
  ? path.join(process.resourcesPath, '.env.production') // in packaged app
  : path.resolve(__dirname, '../../.env');              // in dev

dotenv.config({ path: envPath });

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
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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
  const iconPath = path.join(__dirname, '../../assets/icon.svg');
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
  log('app:start', { platform: process.platform, version: app.getVersion() });

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