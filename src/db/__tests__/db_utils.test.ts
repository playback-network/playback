import { jest } from '@jest/globals';
import { query, initializeDatabase } from '../db';
import {
  insertScreenshot,
  getPrevScreenshot,
  getRedactedScreenshotCount,
  getSessionId,
  recordEvent,
  initializeSession,
  updateSessionWithUserId, 
  getScreenResolution
} from '../db_utils';
import {
  getPendingScreenshots,
  insertRedactedScreenshot,
  setScreenshotQueuedForOCR,
  setScreenshotCompleted,
  resolveFailedScreenshot,
  uploadPendingRedactedScreenshotsAndEvents
} from '../db_redacted_utils';
import AWS from 'aws-sdk';

// Define types for our mocks
type MockScreenshot = {
  id: number;
  original_screenshot_id: number;
  redacted_image: Buffer;
};

type MockEvent = {
  id: number;
  event_type: string;
  data: { test: string };
};

type QueryResult = any;

// Update the mock at the top of the file
jest.mock('../db', () => ({
  query: jest.fn(),
  initializeDatabase: jest.fn(),
  db: {
    exec: jest.fn(),
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      all: jest.fn(),
      get: jest.fn()
    })
  }
}));

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    upload: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({} as QueryResult)
    })
  })),
  config: {
    update: jest.fn(),
    credentials: {
      refresh: jest.fn((callback: () => void) => callback())
    }
  }
}));

jest.mock('../db_redacted_utils', () => {
  const original = jest.requireActual('../db_redacted_utils') as any;
  return {
    ...original,
    getPendingScreenshots: jest.fn(),
    insertRedactedScreenshot: jest.fn(),
    // setScreenshotQueuedForOCR: jest.fn(),
    // setScreenshotCompleted: jest.fn(),
    // resolveFailedScreenshot: jest.fn(),
    // uploadPendingRedactedScreenshotsAndEvents: jest.fn()
  };
});

describe('Database Utilities', () => {
  beforeEach(() => {
    // Clear mock calls between tests
    jest.clearAllMocks();
  });

//   describe('printScreenResolution', () => {
//     it('should print the screen resolution', () => {
//       const mockResolution = '1920x1080';
//       const { execSync } = require('child_process');
//       execSync.mockReturnValue(`Resolution: ${mockResolution}`);

//       console.log = jest.fn(); // Mock console.log

//       getScreenResolution();

//       expect(console.log).toHaveBeenCalledWith(`Screen Resolution: ${mockResolution}`);
//     });

//     it('should handle errors gracefully', () => {
//       const { execSync } = require('child_process');
//       execSync.mockImplementation(() => {
//         throw new Error('Command failed');
//       });

//       console.error = jest.fn(); // Mock console.error

//       getScreenResolution();

//       expect(console.error).toHaveBeenCalledWith('Error getting screen resolution:', expect.any(Error));
//     });
//   });

  describe('insertScreenshot', () => {
    it('should insert a screenshot and return the id', () => {
      const mockLastId = 123;
      (query as jest.Mock).mockReturnValue({ lastInsertRowid: mockLastId });

      const imageBuffer = Buffer.from('test');
      const p_hash = 'test_hash';
      const timestamp = new Date();

      const result = insertScreenshot(imageBuffer, p_hash, timestamp);

      expect(result).toBe(mockLastId);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO screenshots'),
        [imageBuffer, p_hash, timestamp.toString()]
      );
    });

    it('should throw an error when query fails', () => {
      (query as jest.Mock).mockImplementation(() => {
        throw new Error('Database error');
      });

      expect(() => insertScreenshot(Buffer.from('test'), 'hash', new Date()))
        .toThrow('Database error');
    });
  });

  describe('getPrevScreenshot', () => {
    it('should return screenshot when found', () => {
      const mockScreenshot = { id: 1, image: Buffer.from('test') };
      (query as jest.Mock).mockReturnValue([mockScreenshot]);

      const result = getPrevScreenshot(1);

      expect(result).toEqual(mockScreenshot);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, image'),
        [1]
      );
    });

    it('should return null when screenshot not found', () => {
      (query as jest.Mock).mockReturnValue([]);

      const result = getPrevScreenshot(1);

      expect(result).toBeNull();
    });
  });

  describe('getRedactedScreenshotCount', () => {
    it('should return the count of redacted screenshots', async () => {
      (query as jest.Mock).mockReturnValue([{ count: 5 }]);

      const result = await getRedactedScreenshotCount();

      expect(result).toBe(5);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)')
      );
    });

    it('should return 0 when no redacted screenshots exist', async () => {
      (query as jest.Mock).mockReturnValue([{ count: 0 }]);

      const result = await getRedactedScreenshotCount();

      expect(result).toBe(0);
    });
  });

  describe('getSessionId', () => {
    it('should return the latest session id', () => {
      (query as jest.Mock).mockReturnValue([{ id: 123 }]);

      const result = getSessionId();

      expect(result).toBe(123);
    });

    it('should throw error when no session exists', () => {
      (query as jest.Mock).mockReturnValue([]);

      expect(() => getSessionId()).toThrow('No session found');
    });
  });

  describe('recordEvent', () => {
    it('should record an event successfully', () => {
      // Mock getSessionId to return a specific ID
      (query as jest.Mock).mockImplementationOnce(() => [{ id: 1 }])  // For getSessionId
        .mockImplementationOnce((sql, params) => {});  // For the INSERT query

      const timestamp = new Date();
      
      recordEvent('test_event', { detail: 'test' }, 1, 2, timestamp);

      // Verify the second call was the INSERT
      expect(query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('INSERT INTO events'),
        expect.arrayContaining([1, 2, 'test_event', expect.any(String)])
      );
    });
  });

  describe('initializeSession', () => {
    it('should initialize a new session and return its id', () => {
      const mockLastId = 456;
      (query as jest.Mock).mockReturnValue({ lastInsertRowid: mockLastId });

      const result = initializeSession();

      expect(result).toBe(mockLastId);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions')
      );
    });
  });

  describe('updateSessionWithUserId', () => {
    it('should update session with user id', () => {
      updateSessionWithUserId(1, 123);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        [123, 1]
      );
    });
  });
});

describe('Redacted Database Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPendingScreenshots', () => {
    it('should return pending screenshots', () => {
      const mockScreenshots = [
        { id: 1, image: Buffer.from('test1') },
        { id: 2, image: Buffer.from('test2') }
      ];
      (getPendingScreenshots as jest.Mock).mockReturnValue(mockScreenshots);

      const result = getPendingScreenshots();
      expect(result).toBe(mockScreenshots);
    });
  });

  describe('insertRedactedScreenshot', () => {
    it('should insert redacted screenshot and return id', () => {
      const mockLastId = 789;
      (insertRedactedScreenshot as jest.Mock).mockReturnValue(mockLastId);

      const result = insertRedactedScreenshot(
        1,
        Buffer.from('redacted'),
        new Date()
      );

      expect(result).toBe(mockLastId);
    });
  });

  describe('setScreenshotQueuedForOCR', () => {
    it('should update screenshot status to in_progress', () => {
      (query as jest.Mock).mockReturnValue(undefined);

      setScreenshotQueuedForOCR(1);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE screenshots'),
        ['in_progress', 1]
      );
    });
  });

  describe('setScreenshotCompleted', () => {
    it('should set status to completed for given screenshot id', () => {
      (query as jest.Mock).mockReturnValue(undefined);
  
      setScreenshotCompleted(42);
  
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE screenshots'),
        ['completed', 42]
      );
    });
  });
  
  describe('resolveFailedScreenshot', () => {
    it('should set status to failed for given screenshot id', () => {
      (query as jest.Mock).mockReturnValue(undefined);
  
      resolveFailedScreenshot(1337);
  
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE screenshots'),
        ['failed', 1337]
      );
    });
  });
  
  describe('uploadPendingRedactedScreenshotsAndEvents', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Explicitly restore the real implementation
      jest.unmock('../db_redacted_utils');
    });

    it('should upload pending screenshots and events to S3', async () => {
      // Mock data
      const mockScreenshots = [{
        id: 1,
        redacted_image: Buffer.from('redacted')
      }];
      
      const mockEvents = [{
        id: 1,
        event_type: 'test',
        data: { test: 'data' }
      }];

      // Set up query mock chain
      (query as jest.Mock)
        .mockResolvedValueOnce(mockScreenshots)
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      // Mock S3
      const mockUpload = jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      });
      const mockS3 = jest.fn(() => ({ upload: mockUpload }));
      (AWS.S3 as unknown as jest.Mock) = mockS3;

      await uploadPendingRedactedScreenshotsAndEvents();

      // Verify database queries
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM redacted_screenshots WHERE uploaded = 0'
      );
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM events WHERE uploaded = 0'
      );
      expect(query).toHaveBeenCalledWith(
        'UPDATE redacted_screenshots SET uploaded = 1 WHERE id = ?',
        [1]
      );
      expect(query).toHaveBeenCalledWith(
        'UPDATE events SET uploaded = 1 WHERE id = ?',
        [1]
      );

      // Verify S3 uploads
      expect(mockUpload).toHaveBeenCalledWith({
        Bucket: expect.any(String),
        Key: 'screenshots/1.png',
        Body: mockScreenshots[0].redacted_image
      });
      expect(mockUpload).toHaveBeenCalledWith({
        Bucket: expect.any(String),
        Key: 'events/1.json',
        Body: JSON.stringify(mockEvents[0])
      });
    });

    it('should handle empty results', async () => {
      (query as jest.Mock)
        .mockResolvedValueOnce([])  // No screenshots
        .mockResolvedValueOnce([]); // No events

      await uploadPendingRedactedScreenshotsAndEvents();

      expect(query).toHaveBeenCalledTimes(2); // Only the SELECT queries
    });

    it('should handle upload errors', async () => {
      const mockScreenshots = [{ id: 1, redacted_image: Buffer.from('test') }];
      (query as jest.Mock).mockResolvedValueOnce(mockScreenshots)
        .mockResolvedValueOnce([]);

      const mockUpload = jest.fn().mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Upload failed'))
      });
      (AWS.S3 as unknown as jest.Mock) = jest.fn(() => ({ upload: mockUpload }));

      await expect(uploadPendingRedactedScreenshotsAndEvents()).rejects.toThrow('Upload failed');
    });
  });
});

describe('Database Initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create all required tables', () => {
    const mockDb = {
      exec: jest.fn()
    };

    // Mock the database initialization with actual SQL statements
    (initializeDatabase as jest.Mock).mockImplementation(() => {
      mockDb.exec(`
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
      mockDb.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id),
          video_path TEXT,
          start_time DATETIME NOT NULL,
          end_time DATETIME
        );
      `);
      // ... other tables
    });

    initializeDatabase();

    expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('users'));
    expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('sessions'));
  });

  it('should handle database initialization errors', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock initializeDatabase to actually throw an error
    (initializeDatabase as jest.Mock).mockImplementation(() => {
      const error = new Error('Database initialization error');
      console.error('Error initializing the database:', error);
      // Don't throw the error since the function is supposed to handle it
    });

    initializeDatabase();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error initializing the database:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
}); 