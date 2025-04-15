// app/heap.ts
import { app } from 'electron';
import v8 from 'v8';
import fs from 'fs';
import path from 'path';

let count = 0;
const maxDumps = 10;

function writeHeapSnapshot(label: string = ''): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `heap-${label}-${timestamp}.heapsnapshot`;
    const logsPath = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logsPath, { recursive: true });

    const snapshotPath = path.join(logsPath, filename);
    const snapshotStream = v8.getHeapSnapshot();
    const fileStream = fs.createWriteStream(snapshotPath);
    snapshotStream.pipe(fileStream);

    console.log('[heap] snapshot written to', snapshotPath);
    return snapshotPath;
}
  

  
export function performanceLoop() {
    const loop = setInterval(() => {
      if (count >= maxDumps) {
        clearInterval(loop);
        return;
      }
      writeHeapSnapshot('performance-loop');
      count++;
    }, 10000);
}