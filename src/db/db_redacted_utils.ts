import { query } from './db';

export const getPendingScreenshots = async (limit = 10) => {
  const results = await query(
    `SELECT * FROM screenshots WHERE processing_status = ? ORDER BY id ASC LIMIT ?`,
    ['pending', limit]
  );
  return results || [];
};

export const insertRedactedScreenshot = async (originalId: number, redactedImage: Buffer, timestamp: Date) => {
  try {
    return await query(
      'INSERT INTO redacted_screenshots (original_screenshot_id, redacted_image, timestamp) VALUES (?, ?, ?)',
      [originalId, redactedImage, timestamp.toISOString()]
    );
  } finally {
    redactedImage.fill(0);
    redactedImage = Buffer.alloc(0); // break the external memory link
  }
};

export const setScreenshotQueuedForOCR = async (id: number): Promise<boolean> => {
  const result = await query('UPDATE screenshots SET processing_status = ? WHERE id = ?', ['in_progress', id]);
  return result.changes > 0;
};

export const setScreenshotCompleted = async (id: number) => {
  return await query('UPDATE screenshots SET processing_status = ? WHERE id = ?', ['completed', id]);
};

export const resolveFailedScreenshot = async (id: number) => {
  return await query('UPDATE screenshots SET processing_status = ? WHERE id = ?', ['failed', id]);
};

