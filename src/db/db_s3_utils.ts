import AWS from 'aws-sdk';
import { query } from './db';
import { getIdToken, getCognitoIdentityFromDB, setAWSCredentials } from '../services/auth';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';


function getBucket(){
  const BUCKET_NAME = process.env.BUCKET_NAME;
  if (!BUCKET_NAME) {
      throw new Error('❌ BUCKET_NAME not set in environment (.env)');
  }
  return BUCKET_NAME;
}

export async function uploadRedactedScreenshotsAndEvents() {
  try {
    const screenshots = await query(`
      SELECT id, original_screenshot_id, redacted_image
      FROM redacted_screenshots
      WHERE uploaded = 0
    `);

    if (!screenshots.length) return;

    const cognitoIdentityId = await getCognitoIdentityFromDB();
    const idToken = await getIdToken();
    await setAWSCredentials(idToken);

    const s3 = new AWS.S3();

    for (const screenshot of screenshots) {
      const { id, original_screenshot_id, redacted_image } = screenshot;

      const events = await query(`
        SELECT * FROM events
        WHERE before_screenshot_id = ? OR after_screenshot_id = ?
      `, [original_screenshot_id, original_screenshot_id]);

      const relatedIds = events.flatMap(ev => [ev.before_screenshot_id, ev.after_screenshot_id]);
      if (relatedIds.length === 0) continue;

      const redactedRows = await query(`
        SELECT original_screenshot_id FROM redacted_screenshots
        WHERE original_screenshot_id IN (${relatedIds.map(() => '?').join(',')})
      `, relatedIds);

      const redactedIds = redactedRows.map(r => r.original_screenshot_id);
      const allDepsSatisfied = relatedIds.every(id => redactedIds.includes(id));
      if (!allDepsSatisfied) continue;

      const baseKey = `${cognitoIdentityId}/${original_screenshot_id}-${Date.now()}`;
      const imageKey = `${baseKey}.png`;
      const eventsKey = `${baseKey}-events.json`;

      await s3.upload({
        Bucket: getBucket(),
        Key: imageKey,
        Body: redacted_image,
        ContentType: 'image/png',
        ACL: 'private',
      }).promise();

      await s3.upload({
        Bucket: getBucket(),
        Key: eventsKey,
        Body: JSON.stringify(events, null, 2),
        ContentType: 'application/json',
        ACL: 'private',
      }).promise();

      console.log(`✅ Uploaded screenshot ${original_screenshot_id} and ${events.length} events`);

      await query(`UPDATE redacted_screenshots SET uploaded = 1 WHERE id = ?`, [id]);
    }
  } catch (err) {
    console.error('🚨 Upload error:', err);
  }
}

export async function uploadAppLogs() {
    try {
      const logsPath = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logsPath)) return;
  
      const files = fs.readdirSync(logsPath)
        .filter(f => f.endsWith('.log') || f.endsWith('.heapsnapshot'));
  
        if (files.length === 0) {
          console.log('📁 No logs to upload');
          return;
        }  
      let idToken, cognitoIdentityId;
      try {
        idToken = await getIdToken();
        cognitoIdentityId = await getCognitoIdentityFromDB();
      } catch (err) {
        console.warn('⚠️ Skipping log upload — user not signed in or identity unavailable');
        return;
      }
      await setAWSCredentials(idToken);
      const s3 = new AWS.S3();
  
      for (const file of files) {
        const filePath = path.join(logsPath, file);
        const body = fs.createReadStream(filePath);
        const s3Key = `${cognitoIdentityId}/logs/${file}`;
  
        await s3.upload({
          Bucket: getBucket(),
          Key: s3Key,
          Body: body,
          ACL: 'private',
        }).promise();
  
        console.log(`📤 Uploaded log: ${s3Key}`);
      }
    } catch (err) {
      console.error('🚨 Log upload failed:', err);
    }
}