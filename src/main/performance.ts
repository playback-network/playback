import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import pidusage from 'pidusage';
import { ChildProcess } from 'child_process';

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'performance.log');

let ocrPid: number | null = null;
let eventPid: number | null = null;

export function registerChildProcesses(ocr: ChildProcess, eventLogger: ChildProcess) {
  ocrPid = ocr.pid ?? null;
  eventPid = eventLogger.pid ?? null;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getSystemStats() {
  const mem = process.memoryUsage();
  const cpu = process.getCPUUsage();

  return {
    timestamp: new Date().toISOString(),
    cpu: cpu.percentCPUUsage,
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    loadAvg: os.loadavg(),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
  };
}

async function getChildStats(pid: number) {
  try {
    const stats = await pidusage(pid);
    return {
      pid,
      cpu: stats.cpu,
      memory: stats.memory,
    };
  } catch (err) {
    return null;
  }
}

export function startMonitoring(interval = 2000) {
  ensureLogDir();

  const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  stream.write('timestamp,cpu,rss,heapUsed,heapTotal,load1,load5,load15,totalMem,freeMem,ocrCPU,ocrMem,eventCPU,eventMem\n');

  setInterval(async () => {
    const sys = getSystemStats();
    const ocrStats = ocrPid ? await getChildStats(ocrPid) : null;
    const eventStats = eventPid ? await getChildStats(eventPid) : null;

    const line = [
      sys.timestamp,
      sys.cpu.toFixed(2),
      sys.rss,
      sys.heapUsed,
      sys.heapTotal,
      sys.loadAvg[0].toFixed(2),
      sys.loadAvg[1].toFixed(2),
      sys.loadAvg[2].toFixed(2),
      sys.totalMem,
      sys.freeMem,
      ocrStats?.cpu?.toFixed(2) ?? '',
      ocrStats?.memory ?? '',
      eventStats?.cpu?.toFixed(2) ?? '',
      eventStats?.memory ?? '',
    ].join(',') + '\n';

    stream.write(line);
  }, interval);
}
