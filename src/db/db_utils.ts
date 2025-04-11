import { query } from './db';
import AWS from 'aws-sdk';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'child_process';
import { app } from 'electron';
import { getActiveSessionId as getSessionId } from './sessionStore';

// Types
interface Screenshot {
  id: number;
  image: Buffer;
}

interface QueryResult {
  lastInsertRowid?: number;
  count?: number;
}

// auth logic

export function getCognitoId(): string {
  try {
    const result = query(`SELECT cognito_identity_id FROM users LIMIT 1;`);
    if (result.length > 0 && result[0].cognito_identity_id) {
      return result[0].cognito_identity_id;
    }
    return null;
  } catch (e) {
    console.error('DB error in getCognitoId:', e);
    return null;
  }
}
// Database utility functions
export function getAuthStatus(): string {
  try {
    const sql = `SELECT cognito_identity_id FROM users LIMIT 1;`;
    const result = query(sql);
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

export function insertScreenshot(imageBuffer: Buffer, p_hash: string, timestamp: Date): number {
  try {
    const sql = `
      INSERT INTO screenshots (image, p_hash, timestamp, processing_status)
      VALUES (?, ?, ?, 'pending')
    `;
    const result = query(sql, [imageBuffer, p_hash, timestamp.toString()]) as QueryResult;
    console.log(`Screenshot inserted with ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid!;
  } catch (error) {
    console.error('Error inserting screenshot:', error);
    throw error;
  }
}

export function getPrevScreenshot(previousScreenshotId: number): Screenshot | null {
  try {
    const sql = `SELECT id, image FROM screenshots WHERE id = ?`;
    const result = query(sql, [previousScreenshotId]);
    return result.length ? result[0] : null;
  } catch (error) {
    console.error('Error fetching previous screenshot:', error);
    throw error;
  }
}

export async function getRedactedScreenshotCount(): Promise<number> {
  try {
    const result = query('SELECT COUNT(*) as count FROM redacted_screenshots') as QueryResult[];
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
    const cognitoIdentityId = getCognitoId();
    const logsDir = app.isPackaged 
      ? path.join(app.getPath('userData'), 'logs') 
      : path.join(__dirname, 'logs');
    
    const files = fs.readdirSync(logsDir);
    let totalSize = 0;

    files.forEach((file) => {
      const stats = fs.statSync(path.join(logsDir, file));
      totalSize += stats.size;
    });

    if (totalSize > 50 * 1024 * 1024) {
      uploadLogsToS3(cognitoIdentityId, files, logsDir);
    }
  } catch (error) {
    console.error('Error in monitorLogs:', error);
  }
}

export function getScreenResolution() {
  try {
    const output = execSync('system_profiler SPDisplaysDataType').toString();
    const match = output.match(/Resolution:\s*(\d+) x (\d+)/);
    if (match) {
      return `${match[1]}x${match[2]}`;
    }
  } catch (error) {
    console.error('Error getting screen resolution:', error);
  }
  return 'unknown';
}

export function recordEvent(
  type: string,
  eventDetails: object,
  beforeScreenshotId: number | null = null,
  afterScreenshotId: number | null = null,
  timestamp: Date
): void {
  try {
    const sessionId = getSessionId();
    const screenResolution = getScreenResolution();
    const sql = `
      INSERT INTO events (
        before_screenshot_id, 
        after_screenshot_id, 
        event_type, 
        screen_resolution, 
        timestamp, 
        details, 
        session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    query(sql, [
      beforeScreenshotId,
      afterScreenshotId,
      type,
      screenResolution,
      timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
      eventDetails ? JSON.stringify(eventDetails) : '{}',
      sessionId
    ]);

    console.log(`Event recorded: ${type} with timestamp ${timestamp}`);
  } catch (error) {
    console.error(`Error recording event: ${error}`);
    throw error;
  }
}

export function initializeSession(): number {
  try {
    const result = query(`
      INSERT INTO sessions (user_id, start_time)
      VALUES (NULL, datetime('now'))
    `) as QueryResult;
    console.log(`Session initialized with ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid!;
  } catch (error) {
    console.error('Error initializing session:', error);
    throw error;
  }
}

export function updateSessionWithUserId(sessionId: number, userId: number): void {
  try {
    const sql = `UPDATE sessions SET user_id = ? WHERE id = ?`;
    query(sql, [userId, sessionId]);
    console.log(`Session ${sessionId} updated with user ID ${userId}`);
  } catch (error) {
    console.error('Error updating session with user ID:', error);
    throw error;
  }
}
