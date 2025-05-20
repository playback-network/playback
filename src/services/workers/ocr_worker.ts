import { parentPort } from 'worker_threads';

const OCR_SERVER_URL = "http://127.0.0.1:8080/ocr";

type WorkerMessage = {
  screenshotId: number;
  imageData: ArrayBuffer;
};

type OCRResponse = {
  status: string;
  redactedImage?: string;
  error?: string;
};

parentPort?.on('message', async ({ screenshotId, imageData }: WorkerMessage) => {  console.log(`🧠 worker got job ${screenshotId}`);
  try {
    const form = new FormData();
    const file = new File([imageData], `screenshot-${screenshotId}.jpg`, {
      type: 'image/jpeg',
    });
    form.append('image', file);
    

    const response = await fetch(OCR_SERVER_URL, {
      method: 'POST',
      body: form,
    });

    const result = await response.json() as OCRResponse;
    Buffer.from(imageData).fill(0);
    
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
    Buffer.from(imageData).fill(0);
    console.error(`❌ OCR worker error for screenshot ${screenshotId}:`, err);
    parentPort?.postMessage({
      status: "failed",
      screenshotId,
      error: err.message,
    });
  }
});
