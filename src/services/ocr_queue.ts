  import { performOCRAndRedact, runOcrWorker } from './ocr_service';
  import AsyncLimiter from 'async-limiter';

  const limit = new AsyncLimiter({ maxConcurrent: 3 });

  export function queueForOCR(screenshotId: number, imageData: Buffer) {
    if (!screenshotId || !imageData) {
      console.error(`Invalid screenshotId or imageData: ${screenshotId}`);
      return;
    }

    limit.push(async (cb) => {
      try {
        const redactedImage = await performOCRAndRedact(imageData);
        await runOcrWorker(screenshotId, redactedImage);
        cb();
      } catch (error) {
        console.error(`Error processing screenshot ${screenshotId}:`, error);
        cb(error);
      }
    });
  }
