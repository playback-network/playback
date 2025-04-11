import { parentPort } from 'worker_threads';
import { FormData, File } from 'undici';
import { fetch } from 'undici';

const OCR_SERVER_URL = "http://localhost:8080/ocr";

type WorkerMessage = {
  screenshotId: number;
  imageData: Buffer;
};

type OCRResponse = {
  status: string;
  redactedImage?: string;
  error?: string;
};

parentPort?.on('message', async ({ screenshotId, imageData }: WorkerMessage) => {
  try {
    const form = new FormData();
    const file = new File([imageData], `screenshot-${screenshotId}.jpg`, {
      type: 'image/jpeg',
    });
    form.set('image', file);

    const response = await fetch(OCR_SERVER_URL, {
      method: 'POST',
      body: form,
    });

    const result = await response.json() as OCRResponse;

    if (result.status === "success" && result.redactedImage) {
      parentPort?.postMessage({
        status: "completed",
        screenshotId,
        redactedImage: result.redactedImage,
      });
    } else {
      parentPort?.postMessage({
        status: "failed",
        screenshotId,
        error: result.error ?? "unknown error",
      });
    }
  } catch (err: any) {
    console.error(`❌ OCR worker error for screenshot ${screenshotId}:`, err);
    parentPort?.postMessage({
      status: "failed",
      screenshotId,
      error: err.message,
    });
  }
});
