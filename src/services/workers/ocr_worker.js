import { parentPort } from 'worker_threads';
import fetch from 'node-fetch';
import { insertRedactedScreenshot, setScreenshotCompleted, resolveFailedScreenshot } from '../../db/db_redacted_utils';
const OCR_SERVER_URL = "http://localhost:8080/ocr";
parentPort?.on('message', async ({ screenshotId, imageData }) => {
    if (!screenshotId || !imageData) {
        console.error("invalid message payload");
        parentPort?.postMessage({ status: "failed", error: "missing screenshotId or imageData" });
        return;
    }
    try {
        const response = await fetch(OCR_SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                screenshotId,
                imageData: imageData.toString("base64"),
            }),
        });
        const result = await response.json();
        if (result.status === "success" && result.redactedImage) {
            const redactedImageBuffer = Buffer.from(result.redactedImage, "base64");
            await insertRedactedScreenshot(screenshotId, redactedImageBuffer, new Date());
            await setScreenshotCompleted(screenshotId);
            console.log(`OCR completed for screenshot ${screenshotId}`);
            parentPort?.postMessage({ screenshotId, status: "completed" });
        }
        else {
            console.error(`OCR failed for screenshot ${screenshotId}: ${result.error}`);
            await resolveFailedScreenshot(screenshotId);
            parentPort?.postMessage({ screenshotId, status: "failed", error: result.error });
        }
    }
    catch (error) {
        console.error(`Error processing screenshot ${screenshotId}:`, error);
        await resolveFailedScreenshot(screenshotId);
        parentPort?.postMessage({ screenshotId, status: "failed", error: error.message });
    }
});
