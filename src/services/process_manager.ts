import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { startContinuousCapture, stopContinuousCapture } from './capture_engine';
import { EventEmitter } from 'events';
import { getPendingScreenshots, setScreenshotQueuedForOCR } from '../db/db_redacted_utils';
import { getOCRQueueLength, queueForOCR } from './ocr_queue';
import { uploadRedactedScreenshotsAndEvents } from '../db/db_s3_utils';
import { app } from 'electron';

export const userEventEmitter = new EventEmitter();

let eventCapture: ReturnType<typeof spawn> | null = null;
let ocrServer: ChildProcessWithoutNullStreams | null = null;
let shuttingDown = false;
let buffer = '';
let uploadLoopActive = true;
let uploadLoopPromise: Promise<void> | null = null;

export function startBackgroundProcesses() {
  // ⚡ start Swift OCR server
  const isProd = app.isPackaged;
  const binDir = isProd
  ? path.join(process.resourcesPath, 'bin')
  : path.join(__dirname, '../bin');

  const ocrBin = path.join(binDir, 'OCRServer');
  const eventBin = path.join(binDir, 'Eventlogger');

  ocrServer = spawn(ocrBin, [], {
    stdio: 'inherit',
  });
  console.log('🚀 OCR server started');

  eventCapture = spawn(eventBin, [], { stdio: ['ignore', 'pipe', 'inherit'] });

  eventCapture.stdout?.on('data', (data) => {
    buffer += data.toString();

    let lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        userEventEmitter.emit('user-event', parsed);
      } catch (e) {
        console.error('❌ Failed to parse Swift event:', line);
      }
    }
  });

  startContinuousCapture();
  pollAndRedactScreenshots();
}

export function stopBackgroundProcesses() {
  stopContinuousCapture();
  if (shuttingDown) return;
  shuttingDown = true;

  if (ocrServer) {
    ocrServer.kill('SIGTERM');
    ocrServer = null;
    console.log('🛑 OCR server stopped');
  }
  if (eventCapture) {
    eventCapture.kill('SIGTERM');
    eventCapture = null;
    console.log('🛑 Event capture stopped');
  }
}

export function startUploadLoop(intervalMs = 5000) {
  if (uploadLoopPromise) return;
  uploadLoopActive = true;
  uploadLoopPromise = (async () => {
    while (uploadLoopActive) {
      try {
        await uploadRedactedScreenshotsAndEvents();
      } catch (err) {
        console.error("📤 S3 upload failed:", err);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  })();
}

export async function stopUploadLoop() {
  uploadLoopActive = false;
  if (uploadLoopPromise) {
    await uploadLoopPromise;
    uploadLoopPromise = null;
  }
}

function pollAndRedactScreenshots() {
  const maxQueueSize = 10;

  setInterval(async () => {
    try {
      const current = getOCRQueueLength();
      if (current >= maxQueueSize) {
        console.log(`⏳ OCR queue full (${current}/${maxQueueSize}), skipping poll`);
        return;
      }

      const available = maxQueueSize - current;
      const unredacted = await getPendingScreenshots(available);
      if (unredacted.length === 0) return;

      for (const shot of unredacted) {
        await setScreenshotQueuedForOCR(shot.id);
        
        queueForOCR(shot.id, shot.image);
      }
    } catch (err) {
      console.error('❌ Error fetching unredacted screenshots:', err);
    }
  }, 5000);
}