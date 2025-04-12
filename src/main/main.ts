import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'node:path';
import { initializeDatabase } from '../db/db';
import { performOCRAndRedact } from '../services/ocr_service'; // Corrected import path
import { startBackgroundProcesses, stopBackgroundProcesses, userEventEmitter } from '../services/process_manager';
import { handleUserEvent } from '../services/capture_engine';
import { getAuthStatus, getRedactedScreenshotCount, initializeSession } from '../db/db_utils';
import './auth';
import { setActiveSessionId } from '../db/sessionStore';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuiting = false;
// Add this function to clean up resources
function cleanup() {
  stopBackgroundProcesses();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
}

function shutdown() {
  if (isQuiting) return;
  isQuiting = true;
  cleanup();
  app.quit();
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

  // Log both variables to debug
  console.log('ELECTRON_RENDERER_URL:', process.env.ELECTRON_RENDERER_URL);

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
    if (!isQuiting) {
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
        isQuiting = true;
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
  startBackgroundProcesses();
  await initializeDatabase();
  const sessionId = await initializeSession();
  await setActiveSessionId(sessionId);
  createWindow();
  createTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
}); 

app.on('before-quit', shutdown);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') shutdown();
});

process.on('SIGTERM', shutdown);

process.on('SIGINT', shutdown);