import { Worker } from 'worker_threads';
import { resolve } from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { insertRedactedScreenshot, setScreenshotCompleted, resolveFailedScreenshot } from '../db/db_redacted_utils';

const SWIFT_SERVER_URL = "http://127.0.0.1:8080/ocr";

export async function performOCRAndRedact(imageBuffer: Buffer): Promise<Buffer> {
  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'screenshot.jpeg', contentType: 'image/jpeg' });

  console.log("📡 Uploading image to Swift OCR server via multipart...");

  const response = await axios.post(SWIFT_SERVER_URL, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
  });

  if (!response.data || response.data.status !== "success" || !response.data.redactedImage) {
    throw new Error(`❌ Invalid response from OCR server: ${JSON.stringify(response.data)}`);
  }

  console.log("✅ Redacted image received from Swift OCR server");
  return Buffer.from(response.data.redactedImage, 'base64');
}

export function runOcrWorker(screenshotId: number, imageData: Buffer): Promise<void> {
  return new Promise((resolveWorker, rejectWorker) => {
    const workerPath = resolve(__dirname, '../workers/services/workers/ocr_worker.js');
    const worker = new Worker(workerPath);

    worker.once('message', async (msg) => {
      const { status, redactedImage, error } = msg;

      if (status === 'completed' && redactedImage) {
        try {
          const redactedBuffer = Buffer.from(redactedImage, 'base64');
          await insertRedactedScreenshot(screenshotId, redactedBuffer, new Date());
          await setScreenshotCompleted(screenshotId);
          console.log(`🧠 OCR success inserted screenshot ${screenshotId}`);
          resolveWorker();
        } catch (err) {
          console.error(`🔥 Failed DB write for screenshot ${screenshotId}:`, err);
          await resolveFailedScreenshot(screenshotId);
          rejectWorker(err);
        }
      } else {
        console.error(`🚫 Worker failed for screenshot ${screenshotId}:`, error);
        await resolveFailedScreenshot(screenshotId);
        rejectWorker(new Error(error || 'Worker failed'));
      }
    });

    worker.once('error', rejectWorker);

    worker.once('exit', (code) => {
      if (code !== 0) rejectWorker(new Error(`Worker exited with code ${code}`));
    });

    worker.postMessage({ screenshotId, imageData });
  });
}
