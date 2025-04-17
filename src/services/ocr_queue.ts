  import { performOCRAndRedact, runOcrWorker } from './ocr_service';
  import AsyncLimiter from 'async-limiter';

  const limit = new AsyncLimiter({ maxConcurrent: 3 });
  const MAX_QUEUE_SIZE = 10;
  
  export function queueForOCR(screenshotId: number, imageData: Buffer) {
    if (limit.length >= MAX_QUEUE_SIZE) {
      console.warn(`⚠️ OCR queue full, skipping screenshot ${screenshotId}`);
      return;
    }
  
    limit.push(async (cb) => {
      try {
        // await performOCRAndRedact(imageData);
        await runOcrWorker(screenshotId, imageData);
        cb();
      } catch (err) {
        cb(err);
      }
    });
  }
  
  export function getOCRQueueLength(): number {
    return limit.length;
  }
