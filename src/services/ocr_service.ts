import { Worker } from 'worker_threads';
import { app } from 'electron';
import path from 'path';
import { insertRedactedScreenshot, setScreenshotCompleted, resolveFailedScreenshot } from '../db/db_redacted_utils';

const isProd = app.isPackaged;

export function runOcrWorker(screenshotId: number, imageData: Buffer): Promise<void> {
  return new Promise((resolveWorker, rejectWorker) => {

    const workerPath = isProd
      ? path.join(process.resourcesPath, 'workers', 'services', 'workers', 'ocr_worker.js')
      : path.join(__dirname, '../workers/services/workers/ocr_worker.js');    
    const worker = new Worker(workerPath);

    const cleanup = () => {
      worker.terminate(); // 🔥 Ensure worker exits
    };

    worker.once('message', async (msg) => {
        let redactedBuffer: Buffer | null = null;
        
        try {
          const { status, redactedImage, error } = msg;
  
          if (status === 'completed' && redactedImage) {
            let redactedBuffer = Buffer.from(redactedImage, 'base64');
            await insertRedactedScreenshot(screenshotId, redactedBuffer, new Date());
            await setScreenshotCompleted(screenshotId);
            console.log(`🧠 OCR success inserted screenshot ${screenshotId}`);
            resolveWorker();
          } else {
            console.error(`🚫 Worker failed for screenshot ${screenshotId}:`, error);
            await resolveFailedScreenshot(screenshotId);
            rejectWorker(new Error(error || 'Worker failed'));
          }
        } catch (err) {
          console.error(`🔥 Failed DB write for screenshot ${screenshotId}:`, err);
          await resolveFailedScreenshot(screenshotId);
          rejectWorker(err);
        } finally {
          if (redactedBuffer) {
            redactedBuffer.fill(0);
            redactedBuffer = null;
          }
          cleanup();
        }
    });

    worker.on('error', (err) => {
      console.error(`💥 worker error for screenshot ${screenshotId}:`, err);
      rejectWorker(err);
      cleanup();
    });
    worker.on('exit', (code) => {
      if (code !== 0) rejectWorker(new Error(`Worker exited with code ${code}`));
      cleanup();
    });
    

    worker.postMessage({ screenshotId, imageData}, [imageData.buffer as ArrayBuffer]);
  });
}
