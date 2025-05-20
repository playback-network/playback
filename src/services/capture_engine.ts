import screenshot from 'screenshot-desktop';
import { insertScreenshot, recordEvent } from '../db/db_utils';
import { BrowserWindow } from 'electron';

const MAX_QUEUE_SIZE = 10;
const CAPTURE_INTERVAL_MS = 100; // 100ms

let screenshotQueue: { img: Buffer; timestamp: number }[] = [];
let captureInterval: ReturnType<typeof setInterval> | null = null;
let modifierKeys: Set<number> = new Set();
let scrollSessionActive = false;
let scrollStartScreenshotId: number | null = null;

export function startContinuousCapture() {
  if (captureInterval) return;
  captureInterval = setInterval(async () => {
    try {
      const img = await screenshot({ format: 'jpeg' });
      screenshotQueue.push({ img: img, timestamp: Date.now() });
      if (screenshotQueue.length > MAX_QUEUE_SIZE) {
        const removed = screenshotQueue.shift();
        if (removed) {
          removed.img.fill(0);
          removed.img = null;
        }
      }
    } catch (err) {
      console.error('🖼️ Screenshot capture error:', err);
    }
  }, CAPTURE_INTERVAL_MS);
  
  setInterval(() => {
    const totalSize = screenshotQueue.reduce((sum, s) => sum + (s.img ? s.img.length : 0), 0);
    console.log(`[DEBUG] screenshotQueue length: ${screenshotQueue.length}, total buffer size: ${(totalSize/1024/1024).toFixed(2)} MB`);
  }, 10000);
}

export function stopContinuousCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    screenshotQueue.forEach((s) => s.img.fill(0));
    screenshotQueue = [];
  }
}

function getScreenshotPair(): [before: typeof screenshotQueue[0], after: typeof screenshotQueue[0]] | null {
  if (screenshotQueue.length < 2) return null;
  return [screenshotQueue[screenshotQueue.length - 2], screenshotQueue[screenshotQueue.length - 1]];
}

async function saveScreenshot(img: Buffer, ts: number) {
  const id = await insertScreenshot(img, null, new Date(ts));
  return id;
}

async function handleEventScreenshots(
  eventType: string,
  event: any,
  win?: BrowserWindow,
  singleFrame = false
) {
  const pair = getScreenshotPair();
  if (!pair) return;

  try {
    if (singleFrame) {
      const [_, after] = pair;
      const id = await saveScreenshot(after.img, after.timestamp);
      await recordEvent(eventType, event,id, id, new Date(after.timestamp));
    } else {
      const [before, after] = pair;
      const beforeId = await saveScreenshot(before.img, before.timestamp);
      const afterId = await saveScreenshot(after.img, after.timestamp);
      await recordEvent(eventType, event, beforeId, afterId, new Date(before.timestamp));
    }
    win?.webContents?.send('screenshotSaved');
  } catch (err) {
    console.error(`⚠️ Failed to handle event "${eventType}":`, err);
  }
}

async function handleSpecialKey(event: any, win?: BrowserWindow) {
  const { keyCode } = event;
  if (modifierKeys.size > 0) {
    event.modifierKeys = Array.from(modifierKeys);
    await handleEventScreenshots('specialCombo', { keyCode, ...event }, win);
  } else {
    await handleEventScreenshots('specialKey', { keyCode, ...event }, win);
  }
}

async function handleScrollStart() {
  if (scrollSessionActive) return;
  const pair = getScreenshotPair();
  if (!pair) return;

  scrollSessionActive = true;
  scrollStartScreenshotId = await saveScreenshot(pair[1].img, pair[1].timestamp);
}

async function handleScrollEnd(event: any, win?: BrowserWindow) {
  if (!scrollSessionActive || !scrollStartScreenshotId) return;
  const pair = getScreenshotPair();
  if (!pair) return;

  scrollSessionActive = false;
  const afterId = await saveScreenshot(pair[1].img, pair[1].timestamp);
  await recordEvent('scroll', event, scrollStartScreenshotId, afterId, new Date());
  scrollStartScreenshotId = null;
  win?.webContents?.send('screenshotSaved');
}

function updateModifierKeys(code: number, isDown: boolean) {
  if (isDown) modifierKeys.add(code);
  else modifierKeys.delete(code);
}

export async function handleUserEvent(event: any, win?: BrowserWindow) {
  console.log('📥 event:', event);

  const { eventType, keyCode, flags } = event;

  switch (eventType) {
    case 'scrollStart':
      return handleScrollStart();

    case 'scrollEnd':
      return handleScrollEnd(event, win);

    case 'flagsChanged':
      updateModifierKeys(Number(keyCode), flags?.includes('down'));
      return;

    case 'specialKey':
      return handleSpecialKey(event, win);

    case 'leftClick':
    case 'rightClick':
      return handleEventScreenshots(eventType, event, win);

    default:
      console.warn('⚠️ unhandled event type:', eventType);
  }
}
