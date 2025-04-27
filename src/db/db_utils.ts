import { query } from './db';
import AWS from 'aws-sdk';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { app } from 'electron';
import { getActiveSessionId as getSessionId } from './sessionStore';

interface Screenshot {
  id: number;
  image: Buffer;
}

interface QueryResult {
  lastInsertRowid?: number;
  count?: number;
}

export async function getCognitoId(): Promise<string | null> {
  try {
    const result = await query(`SELECT cognito_identity_id FROM users LIMIT 1;`);
    return result.length > 0 ? result[0].cognito_identity_id : null;
  } catch (e) {
    console.error('DB error in getCognitoId:', e);
    return null;
  }
}

export async function getAuthStatus(): Promise<string> {
  try {
    const result = await query(`SELECT cognito_identity_id FROM users LIMIT 1;`);
    if (result.length > 0) {
      console.log('Cognito Identity ID retrieved from DB:', result[0].cognito_identity_id);
      return result[0].cognito_identity_id;
    }
    throw new Error('Cognito Identity not found in the database.');
  } catch (error) {
    console.error('Error retrieving Cognito Identity ID from DB:', error);
    throw error;
  }
}

export async function insertScreenshot(imageBuffer: Buffer, p_hash: string, timestamp: Date): Promise<number> {
  try {
    const sql = `INSERT INTO screenshots (image, p_hash, timestamp, processing_status) VALUES (?, ?, ?, 'pending')`;
    const result = await query(sql, [imageBuffer, p_hash, timestamp.toString()]) as QueryResult;
    console.log(`Screenshot inserted with ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid!;
  } catch (error) {
    console.error('Error inserting screenshot:', error);
    throw error;
  }
}

export async function getPrevScreenshot(previousScreenshotId: number): Promise<Screenshot | null> {
  try {
    const result = await query(`SELECT id, image FROM screenshots WHERE id = ?`, [previousScreenshotId]);
    return result.length ? result[0] : null;
  } catch (error) {
    console.error('Error fetching previous screenshot:', error);
    throw error;
  }
}

export async function getRedactedScreenshotCount(): Promise<number> {
  try {
    const result = await query('SELECT COUNT(*) as count FROM redacted_screenshots') as QueryResult[];
    return result[0]?.count || 0;
  } catch (error) {
    console.error('Error fetching redacted screenshot count:', error);
    throw error;
  }
}

export async function uploadLogsToS3(cognitoIdentityId: string, files: string[], logsDir: string): Promise<void> {
  try {
    const s3 = new AWS.S3();
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const fileStream = fs.createReadStream(filePath);
      const uploadParams = {
        Bucket: process.env.BUCKET_NAME!,
        Key: `${cognitoIdentityId}/logs/${file}`,
        Body: fileStream,
        ContentType: 'text/plain',
        ACL: 'private',
      };
      await s3.upload(uploadParams).promise();
      console.log(`Uploaded ${file} to S3`);
    }
    for (const file of files) {
      fs.unlinkSync(path.join(logsDir, file));
    }
  } catch (error) {
    console.error('Error uploading logs to S3:', error);
  }
}

export function monitorLogs(): void {
  try {
    getCognitoId().then((cognitoIdentityId) => {
      if (!cognitoIdentityId) return;
      const logsDir = app.isPackaged ? path.join(app.getPath('userData'), 'logs') : path.join(__dirname, 'logs');
      const files = fs.readdirSync(logsDir);
      let totalSize = 0;
      files.forEach((file) => {
        const stats = fs.statSync(path.join(logsDir, file));
        totalSize += stats.size;
      });
      if (totalSize > 50 * 1024 * 1024) {
        uploadLogsToS3(cognitoIdentityId, files, logsDir);
      }
    });
  } catch (error) {
    console.error('Error in monitorLogs:', error);
  }
}

export function getScreenResolution(): string {
  try {
    const output = execSync('system_profiler SPDisplaysDataType').toString();
    const match = output.match(/Resolution:\s*(\d+) x (\d+)/);
    return match ? `${match[1]}x${match[2]}` : 'unknown';
  } catch (error) {
    console.error('Error getting screen resolution:', error);
    return 'unknown';
  }
}

export async function recordEvent(
  type: string,
  eventDetails: object,
  beforeScreenshotId: number | null = null,
  afterScreenshotId: number | null = null,
  timestamp: Date
): Promise<void> {
  try {
    const sessionId = await getSessionId();
    const screenResolution = getScreenResolution() || 'unknown';
    const ts = timestamp?.toISOString?.() ?? new Date().toISOString();
    const details = JSON.stringify(eventDetails || {}); // ensure it's a JSON string

    const sql = `
      INSERT INTO events (
        before_screenshot_id,
        after_screenshot_id,
        event_type,
        screen_resolution,
        timestamp,
        details,
        session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await query(sql, [
      beforeScreenshotId,
      afterScreenshotId,
      type ?? 'unknown',
      screenResolution,
      ts,
      details,
      sessionId
    ]);
    console.log(`Event recorded: ${type} with timestamp ${ts}`);
  } catch (error) {
    console.error(`Error recording event: ${error}`);
    throw error;
  }
}

export async function initializeSession(): Promise<number> {
  try {
    const result = await query(`INSERT INTO sessions (user_id, start_time) VALUES (NULL, datetime('now'))`) as QueryResult;
    console.log(`Session initialized with ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid!;
  } catch (error) {
    console.error('Error initializing session:', error);
    throw error;
  }
}

export async function updateSessionWithUserId(sessionId: number, userId: number): Promise<void> {
  try {
    const sql = `UPDATE sessions SET user_id = ? WHERE id = ?`;
    await query(sql, [userId, sessionId]);
    console.log(`Session ${sessionId} updated with user ID ${userId}`);
  } catch (error) {
    console.error('Error updating session with user ID:', error);
    throw error;
  }
}
