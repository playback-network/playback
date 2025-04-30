import screenshot from 'screenshot-desktop';
import { insertScreenshot, recordEvent } from '../db/db_utils';
import { BrowserWindow } from 'electron';

const MAX_QUEUE_SIZE = 10;
const captureIntervalMs = 500; // 100ms

let screenshotQueue: { img: Buffer; timestamp: number }[] = [];
let captureInterval: ReturnType<typeof setInterval> | null = null;
let modifierKeys: Set<number> = new Set();
let scrollSessionActive = false;
let scrollStartBuffer: { img: Buffer; timestamp: number } | null = null;


export function startContinuousCapture() {
  if (captureInterval) return;
  captureInterval = setInterval(async () => {
    const timestamp = Date.now();
    try {
      const img = await screenshot({ format: 'jpeg' });
      screenshotQueue.push({ img, timestamp });
      if (screenshotQueue.length > MAX_QUEUE_SIZE) {
        const removed = screenshotQueue.shift();
        if (removed?.img) removed.img.fill(0); // optional manual release
      }
    } catch (err) {
      console.error('🖼️ Screenshot capture error:', err);
    }
  }, captureIntervalMs);
}

export function stopContinuousCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    for (const shot of screenshotQueue) {
      shot.img.fill(0);
    }
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
  win?: BrowserWindow,
  useSingleFrame: boolean = false
) {
  const pair = getScreenshotPair();
  if (!pair) return;

  try {
    if (useSingleFrame) {
      const frame = pair[1]; // use the latest screenshot
      const img = Buffer.from(frame.img);
      const ts = new Date(frame.timestamp);
      const screenshotId = await insertScreenshot(img, null, ts);
      img.fill(0);
      await recordEvent(eventType, eventDetails, screenshotId, screenshotId, ts);
    } else {
      const beforeImg = Buffer.from(pair[0].img);
      const afterImg = Buffer.from(pair[1].img);
      const beforeTs = new Date(pair[0].timestamp);
      const afterTs = new Date(pair[1].timestamp);

      const beforeId = await insertScreenshot(beforeImg, null, beforeTs);
      const afterId = await insertScreenshot(afterImg, null, afterTs);

      await recordEvent(eventType, eventDetails, beforeId, afterId, beforeTs);
      beforeImg.fill(0);
      afterImg.fill(0);
    }

    if (win?.webContents) win.webContents.send('screenshotSaved');
  } catch (err) {
    console.error('⚠️ Failed to record screenshot event:', err);
  }
}


export function handleUserEvent(event: any, win?: BrowserWindow) {
  const { eventType, keyCode, flags, timestamp, ...eventDetails } = event;

  if (eventType === 'scrollStart') {
    if (!scrollSessionActive) {
      scrollSessionActive = true;
      const pair = getScreenshotPair();
      if (!pair) return;
      scrollStartBuffer = {
        img: Buffer.from(pair[1].img),
        timestamp: pair[1].timestamp
      };
    }
    return;
  }
  
  if (eventType === 'scrollEnd') {
    if (scrollSessionActive && scrollStartBuffer) {
      scrollSessionActive = false;
  
      const pair = getScreenshotPair();
      if (!pair) return;
  
      const afterImg = Buffer.from(pair[1].img);
      const afterTs = new Date(pair[1].timestamp);
      const beforeImg = Buffer.from(scrollStartBuffer.img);
      const beforeTs = new Date(scrollStartBuffer.timestamp);
      
      if (scrollStartBuffer?.img) scrollStartBuffer.img.fill(0);
      scrollStartBuffer = null;
  
      insertScreenshot(beforeImg, null, beforeTs).then(beforeId =>
        insertScreenshot(afterImg, null, afterTs).then(afterId => {
          beforeImg.fill(0);
          afterImg.fill(0);
          return recordEvent('scroll', eventDetails, beforeId, afterId, beforeTs)
        })
      ).catch(err => {
        console.error('⚠️ Failed to record scroll event:', err);
      });
      if (win?.webContents) win.webContents.send('screenshotSaved');
    }
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
      handleEventScreenshots('specialCombo', { keyCode, ...eventDetails }, win, false);
    } else {
      handleEventScreenshots('specialKey', { keyCode, ...eventDetails }, win, false);
    }
    return;
  }

  switch (eventType) {
    case 'leftClick':
    case 'rightClick':
    case 'scroll':
      handleEventScreenshots(eventType, eventDetails, win, false);
      break;
    default:
      console.log('⚠️ Unhandled user event type:', eventType);
  }
}
