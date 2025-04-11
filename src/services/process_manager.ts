import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { startContinuousCapture, stopContinuousCapture } from './capture_engine';
import { EventEmitter } from 'events';
import { getPendingScreenshots, setScreenshotQueuedForOCR } from '../db/db_redacted_utils';
import { queueForOCR } from './ocr_queue';

export const userEventEmitter = new EventEmitter();

let eventCapture: ReturnType<typeof spawn> | null = null;
let ocrServer: ChildProcessWithoutNullStreams | null = null;
let shuttingDown = false;
let buffer = '';

export function startBackgroundProcesses() {
  // ⚡ start Swift OCR server
  const binDir = path.resolve(__dirname, '../bin'); // `dist/bin`
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

function pollAndRedactScreenshots() {
  setInterval(async () => {
    try {
      const unredacted = await getPendingScreenshots(); // should return [{ id, image }]
      for (const shot of unredacted) {
        setScreenshotQueuedForOCR(shot.id);
        queueForOCR(shot.id, shot.image);
      }
      
    } catch (err) {
      console.error('❌ Error fetching unredacted screenshots:', err);
    }
  }, 5000); // every 5s
}