import screenshot from 'screenshot-desktop';
import { insertScreenshot, recordEvent } from '../db/db_utils';
import { BrowserWindow } from 'electron';

const MAX_QUEUE_SIZE = 20;
const captureIntervalMs = 100;

let screenshotQueue: { img: Buffer; timestamp: number }[] = [];
let captureInterval: ReturnType<typeof setInterval> | null = null;

export function startContinuousCapture() {
  if (captureInterval) return;
  captureInterval = setInterval(async () => {
    const timestamp = Date.now();
    try {
      const img = await screenshot({ format: 'jpeg' });
      screenshotQueue.push({ img, timestamp });
      if (screenshotQueue.length > MAX_QUEUE_SIZE) screenshotQueue.shift();
    } catch (err) {
      console.error('🖼️ Screenshot capture error:', err);
    }
  }, captureIntervalMs);
}

export function stopContinuousCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    screenshotQueue = [];
  }
}

function getScreenshotPair(): [before: typeof screenshotQueue[0], after: typeof screenshotQueue[0]] | null {
  if (screenshotQueue.length < 2) return null;
  return [screenshotQueue[screenshotQueue.length - 2], screenshotQueue[screenshotQueue.length - 1]];
}

async function handleEventScreenshots(
  eventType: string,
  eventDetails: any,
  win?: BrowserWindow
) {
  const pair = getScreenshotPair();
  if (!pair) return;
  const [before, after] = pair;

  const beforeId = await insertScreenshot(before.img, null, new Date(before.timestamp));
  const afterId = await insertScreenshot(after.img, null, new Date(after.timestamp));

  await recordEvent(eventType, eventDetails, beforeId, afterId, new Date(before.timestamp));

  if (win?.webContents) win.webContents.send('screenshotSaved');
}

let modifierKeys: Set<number> = new Set();
let scrollSessionActive = false;
let scrollStartTime = 0;
let duringScrollShotTaken = false;
export function handleUserEvent(event: any, win?: BrowserWindow) {
  const { eventType, keyCode, flags, timestamp, ...eventDetails } = event;

  if (eventType === 'scrollStart') {
    scrollSessionActive = true;
    scrollStartTime = timestamp;
    duringScrollShotTaken = false;

    handleEventScreenshots('scrollStart', eventDetails, win); // capture BEFORE scroll
    return;
  }

  if (eventType === 'scrollEnd') {
    if (scrollSessionActive && !duringScrollShotTaken) {
      const duration = timestamp - scrollStartTime;
      if (duration > 2000) {
        handleEventScreenshots('scrollMid', eventDetails, win); // optional mid-capture
        duringScrollShotTaken = true;
      }
    }

    scrollSessionActive = false;
    handleEventScreenshots('scrollEnd', eventDetails, win); // capture AFTER scroll
    return;
  }

  if (eventType === 'flagsChanged') {
    const code = Number(keyCode);
    if (flags && flags.includes('down')) {
      modifierKeys.add(code);
    } else {
      modifierKeys.delete(code);
    }
    return;
  }

  if (eventType === 'specialKey') {
    if (modifierKeys.size > 0) {
      eventDetails.modifierKeys = Array.from(modifierKeys);
      handleEventScreenshots('specialCombo', { keyCode, ...eventDetails }, win);
    } else {
      handleEventScreenshots('specialKey', { keyCode, ...eventDetails }, win);
    }
    return;
  }

  switch (eventType) {
    case 'leftClick':
    case 'rightClick':
    case 'scroll':
      handleEventScreenshots(eventType, eventDetails, win);
      break;
    default:
      console.log('⚠️ Unhandled user event type:', eventType);
  }
}
