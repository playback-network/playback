import screenshot from 'screenshot-desktop';
import { insertScreenshot, recordEvent } from '../db/db_utils';
import { BrowserWindow } from 'electron';

const MAX_QUEUE_SIZE = 10;
const captureIntervalMs = 100; // 100ms

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
  const beforeImg = Buffer.from(pair[0].img); // clone in case buffer is reused
  const afterImg = Buffer.from(pair[1].img);
  const beforeTs = new Date(pair[0].timestamp);
  const afterTs = new Date(pair[1].timestamp);

  try {
    const beforeId = await insertScreenshot(beforeImg, null, beforeTs);
    const afterId = await insertScreenshot(afterImg, null, afterTs);
    await recordEvent(eventType, eventDetails, beforeId, afterId, beforeTs);
    if (win?.webContents) win.webContents.send('screenshotSaved');
  } catch (err) {
    console.error('⚠️ Failed to record screenshot event:', err);
  }
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
