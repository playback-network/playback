// app/logger.ts
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function log(event: string, data: Record<string, any> = {}) {
  const timestamp = new Date().toISOString();
  const entry = JSON.stringify({ timestamp, event, ...data }) + '\n';

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, entry);

  rotateIfNeeded();
}

function rotateIfNeeded() {
  try {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > MAX_SIZE_BYTES) {
      const rotated = path.join(LOG_DIR, `app-${Date.now()}.log`);
      fs.renameSync(LOG_FILE, rotated);
    }
  } catch (err) {
    // ignore missing file
  }
}

export function getLogFiles(): string[] {
  return fs.readdirSync(LOG_DIR)
    .filter(f => f.endsWith('.log') || f.endsWith('.heapsnapshot'))
    .map(f => path.join(LOG_DIR, f));
}
