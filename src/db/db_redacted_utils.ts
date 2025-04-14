import { query } from './db';
import AWS from 'aws-sdk';

export const getPendingScreenshots = async () => {
  return await query('SELECT * FROM screenshots WHERE processing_status = ?', ['pending']);
};

export const insertRedactedScreenshot = async (originalId: number, redactedImage: Buffer, timestamp: Date) => {
  return await query(
    'INSERT INTO redacted_screenshots (original_screenshot_id, redacted_image, timestamp) VALUES (?, ?, ?)',
    [originalId, redactedImage, timestamp.toString()]
  );
};

export const setScreenshotQueuedForOCR = async (id: number) => {
  return await query('UPDATE screenshots SET processing_status = ? WHERE id = ?', ['in_progress', id]);
};

export const setScreenshotCompleted = async (id: number) => {
  return await query('UPDATE screenshots SET processing_status = ? WHERE id = ?', ['completed', id]);
};

export const resolveFailedScreenshot = async (id: number) => {
  return await query('UPDATE screenshots SET processing_status = ? WHERE id = ?', ['failed', id]);
};

