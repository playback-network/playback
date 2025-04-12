// db.ts
import path from 'path';
import { app } from 'electron';

type QueryParams = any[];

interface DbInstance {
  prepare: (sql: string) => Statement;
  exec: (sql: string) => void;
}

interface Statement {
  all: (...params: QueryParams) => any[];
  get: (...params: QueryParams) => any;
  run: (...params: QueryParams) => any;
}

let db: DbInstance | null = null;

let writeQueue: (() => void)[] = [];
let writing = false;

function enqueueWrite(fn: () => void) {
  writeQueue.push(fn);
  if (!writing) processQueue();
}

function processQueue() {
  const next = writeQueue.shift();
  if (!next) {
    writing = false;
    return;
  }
  writing = true;
  try {
    next();
  } catch (err) {
    console.error('❌ DB write error:', err);
  } finally {
    setImmediate(processQueue);
  }
}

// promise wrapper if needed
function enqueueWriteAsync<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    enqueueWrite(() => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function query(sql: string, params: QueryParams = []) {
  if (!db) throw new Error("❌ DB not initialized");

  const stmt = db.prepare(sql);
  const isSelect = sql.trim().toLowerCase().startsWith("select");
  
  if (isSelect) {
    return stmt.all(...params);
  } else {
    return enqueueWriteAsync(() => stmt.run(...params));
  }
}

// Database initialization function - call this when app is ready
export function initializeDatabase() {
  if (db) return; // Already initialized
  
  try {
    const dbPath = path.join(app.getPath('userData'), 'playback.db');

    console.log(`Initializing database at: ${dbPath}`);
    
    // Dynamic import to avoid bundling issues
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
    
    // Create tables
    db!.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        cognito_identity_id TEXT,
        id_token TEXT,
        refresh_token TEXT,
        access_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sessions table
    db!.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        video_path TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME
      );
    `);

    // Screenshots table
    db!.exec(`
      CREATE TABLE IF NOT EXISTS screenshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image BLOB,
        p_hash TEXT,
        processing_status TEXT DEFAULT 'pending',
        timestamp TEXT
      );
    `);

    // Redacted Screenshots table
    db!.exec(`
      CREATE TABLE IF NOT EXISTS redacted_screenshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_screenshot_id INTEGER REFERENCES screenshots(id),
        redacted_image BLOB,
        uploaded BOOLEAN DEFAULT 0,
        timestamp TEXT
      );
    `);

    // Events table
    db!.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        before_screenshot_id INTEGER REFERENCES screenshots(id),
        after_screenshot_id INTEGER REFERENCES screenshots(id),
        event_type TEXT NOT NULL,
        screen_resolution TEXT,
        timestamp TEXT,
        details TEXT NOT NULL,  
        session_id INTEGER REFERENCES sessions(id)
      );
    `);

    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Error initializing the database:', error);
    throw error;
  }
}

// Export the db instance for direct access if needed
export { db }; 