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

export const uploadPendingRedactedScreenshotsAndEvents = async () => {
  const screenshots = await query('SELECT * FROM redacted_screenshots WHERE uploaded = 0');
  const events = await query('SELECT * FROM events WHERE uploaded = 0');

  const s3 = new AWS.S3();

  for (const screenshot of screenshots) {
    await s3.upload({
      Bucket: process.env.AWS_S3_BUCKET || '',
      Key: `screenshots/${screenshot.id}.png`,
      Body: screenshot.redacted_image,
    }).promise();

    await query('UPDATE redacted_screenshots SET uploaded = 1 WHERE id = ?', [screenshot.id]);
  }

  for (const event of events) {
    await s3.upload({
      Bucket: process.env.AWS_S3_BUCKET || '',
      Key: `events/${event.id}.json`,
      Body: JSON.stringify(event),
    }).promise();

    await query('UPDATE events SET uploaded = 1 WHERE id = ?', [event.id]);
  }
};
