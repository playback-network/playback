  import { runOcrWorker } from './ocr_service';
  import AsyncLimiter from 'async-limiter';

  const limit = new AsyncLimiter({ concurrency: 3 });
  const MAX_QUEUE_SIZE = 10;
  
  export function queueForOCR(screenshotId: number, imageData: Buffer) {
    const transferable = imageData.buffer as ArrayBuffer;
    imageData = null;

    if (limit.length >= MAX_QUEUE_SIZE) {
      console.warn(`⚠️ OCR queue full, skipping screenshot ${screenshotId}`);
      return false;
    }
  
    limit.push(async (cb) => {
      try {
        await runOcrWorker(screenshotId, Buffer.from(transferable));
        cb();
      } catch (err) {
        cb(err);
      }
    });
    return true;
  }
  
  export function getOCRQueueLength(): number {
    return limit.length;
  }
