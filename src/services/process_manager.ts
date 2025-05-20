import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { startContinuousCapture, stopContinuousCapture } from './capture_engine';
import { EventEmitter } from 'events';
import { getPendingScreenshots, setScreenshotQueuedForOCR } from '../db/db_redacted_utils';
import { getOCRQueueLength, queueForOCR } from './ocr_queue';
import { uploadRedactedScreenshotsAndEvents } from '../db/db_s3_utils';
import { app } from 'electron';
import { execSync } from 'node:child_process';

export const userEventEmitter = new EventEmitter();

let eventCapture: ChildProcessWithoutNullStreams | null = null;
let ocrServer: ChildProcessWithoutNullStreams | null = null;
let stopOcrServer: (() => void) | null = null;
let stopEventLogger: (() => void) | null = null;

let shuttingDown = false;
let buffer = '';
let uploadLoopActive = true;
let uploadLoopPromise: Promise<void> | null = null;

const MAX_RETRIES = 5;
const RETRY_BASE_DELAY = 2000;

function killProcessOnPort(port) {
  try {
    const output = execSync(`lsof -i tcp:${port} -t`).toString().trim();
    if (output) {
      const pids = output.split('\n');
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGTERM');
          console.log(`☠️ Killed process on port ${port} (pid ${pid})`);
        } catch (e) {
          console.warn(`⚠️ Failed to kill pid ${pid}:`, e);
        }
      }
    }
  } catch {
    // No process using port or lsof not available
    console.log(`⚠️ No process using port ${port}`);
  }
}

function startProcessWithRetry(binPath, args, stdio, name, onData, onError, maxRetries = MAX_RETRIES) {
  let retries = 0;
  let proc = null;

  const start = () => {
    if (shuttingDown) return;
    console.log(`🚀 Starting ${name} (attempt ${retries + 1})`);
    proc = spawn(binPath, args, { stdio });

    if (onData && proc.stdout) {
      proc.stdout.on('data', onData);
    }
    if (onError && proc.stderr) {
      proc.stderr.on('data', onError);
    }

    proc.on('exit', (code, signal) => {
      if (shuttingDown) return;
      console.error(`❌ ${name} exited with code ${code}, signal ${signal}`);
      if (retries < maxRetries) {
        retries += 1;
        const delay = RETRY_BASE_DELAY * Math.pow(2, retries - 1); // exponential backoff
        console.log(`🔁 Restarting ${name} in ${delay}ms (retry ${retries}/${maxRetries})`);
        setTimeout(start, delay);
      } else {
        console.error(`🛑 ${name} failed too many times, not retrying.`);
      }
    });

    proc.on('error', (err) => {
      if (shuttingDown) return;
      console.error(`❌ Failed to spawn ${name}:`, err);
      if (retries < maxRetries) {
        retries += 1;
        const delay = RETRY_BASE_DELAY * Math.pow(2, retries - 1);
        console.log(`🔁 Retrying ${name} in ${delay}ms (retry ${retries}/${maxRetries})`);
        setTimeout(start, delay);
      } else {
        console.error(`🛑 ${name} spawn failed too many times, not retrying.`);
      }
    });
  };

  start();
  return () => {
    if (proc) {
      proc.kill('SIGTERM');
      proc = null;
    }
  };
}

export function startBackgroundProcesses() {
  // ⚡ start Swift OCR server
  const isProd = app.isPackaged;
  const binDir = isProd
  ? path.join(process.resourcesPath, 'bin')
  : path.join(__dirname, '../bin');
  // killProcessOnPort(8080); // 🔪 kill leftover OCRServer if any
  killProcessOnPort(8080);

  // OCR Server
  const ocrBin = path.join(binDir, 'OCRServer');
  stopOcrServer = startProcessWithRetry(
    ocrBin,
    [],
    ['inherit', 'pipe', 'pipe'],
    'OCRServer',
    (data) => console.log(`[OCRServer] ${data.toString().trim()}`),
    (data) => console.error(`[OCRServer ERROR] ${data.toString().trim()}`)
  );
  // EventLogger
  const eventBin = path.join(binDir, 'Eventlogger');
  let eventBuffer = '';
  stopEventLogger = startProcessWithRetry(
    eventBin,
    [],
    ['ignore', 'pipe', 'inherit'],
    'Eventlogger',
    (data) => {
      eventBuffer += data.toString();
      let lines = eventBuffer.split('\n');
      eventBuffer = lines.pop()!;
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          userEventEmitter.emit('user-event', parsed);
        } catch (e) {
          console.error('❌ Failed to parse Swift event:', line);
        }
      }
    },
    (data) => console.error(`[Eventlogger ERROR] ${data.toString().trim()}`)
  );

  startContinuousCapture();
  pollAndRedactScreenshots();
}

export function stopBackgroundProcesses() {
  stopContinuousCapture();
  if (shuttingDown) return;
  shuttingDown = true;

  if (stopOcrServer) {
    stopOcrServer();
    ocrServer = null;
    console.log('🛑 OCR server stopped');
  }
  if (stopEventLogger) {
    stopEventLogger();
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