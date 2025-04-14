import AWS from 'aws-sdk';
import { query } from './db';
import { getIdToken, getCognitoIdentityFromDB, setAWSCredentials } from '../services/auth';

const BUCKET_NAME = process.env.BUCKET_NAME;

if (!BUCKET_NAME) {
    throw new Error('❌ BUCKET_NAME not set in environment (.env)');
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
        Bucket: BUCKET_NAME!,
        Key: imageKey,
        Body: redacted_image,
        ContentType: 'image/png',
        ACL: 'private',
      }).promise();

      await s3.upload({
        Bucket: BUCKET_NAME!,
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
