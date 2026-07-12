import axios from 'axios';
import { Transform } from 'stream';

class ThrottleStream extends Transform {
  private bytesSent = 0;
  private startTime = Date.now();

  constructor(private bps: number) { // bytes per second
    super();
  }

  _transform(chunk: Buffer, encoding: string, callback: Function) {
    this.bytesSent += chunk.length;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const targetTime = this.bytesSent / this.bps;
    const delay = (targetTime - elapsed) * 1000;

    if (delay > 0) {
      setTimeout(() => {
        this.push(chunk);
        callback();
      }, delay);
    } else {
      this.push(chunk);
      callback();
    }
  }
}

async function run() {
  const url = 'http://buxplay.org:8080/live/38485858999/83848595595/135457.ts';
  const headers = { 'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16' };

  console.log('Testing unthrottled connection first...');
  try {
    const res1 = await axios.get(url, { responseType: 'stream', headers });
    let totalBytes1 = 0;
    const start1 = Date.now();
    await new Promise<void>((resolve) => {
      res1.data.on('data', (chunk: Buffer) => {
        totalBytes1 += chunk.length;
      });
      res1.data.on('end', () => {
        const elapsed = (Date.now() - start1) / 1000;
        console.log(`Unthrottled stream ended after ${elapsed.toFixed(2)}s. Total bytes: ${(totalBytes1 / 1024 / 1024).toFixed(2)} MB`);
        resolve();
      });
      res1.data.on('error', (err: any) => {
        console.log(`Unthrottled stream error: ${err.message}`);
        resolve();
      });
    });
  } catch (e: any) {
    console.error(`Unthrottled setup failed: ${e.message}`);
  }

  console.log('\nTesting throttled connection (simulating VLC real-time consumption at 500 KB/s)...');
  try {
    const res2 = await axios.get(url, { responseType: 'stream', headers });
    // Let's throttle to 500 KB/s (approx 4 Mbps)
    const throttle = new ThrottleStream(500 * 1024);
    res2.data.pipe(throttle);

    let totalBytes2 = 0;
    const start2 = Date.now();
    
    await new Promise<void>((resolve) => {
      throttle.on('data', (chunk: Buffer) => {
        totalBytes2 += chunk.length;
        const elapsed = (Date.now() - start2) / 1000;
        if (elapsed > 45) { // If it survives past 45 seconds, it works!
          console.log(`Throttled stream successfully running for ${elapsed.toFixed(2)}s. Bytes read: ${(totalBytes2 / 1024 / 1024).toFixed(2)} MB`);
          res2.data.destroy();
          resolve();
        }
      });
      throttle.on('end', () => {
        const elapsed = (Date.now() - start2) / 1000;
        console.log(`Throttled stream ended prematurely after ${elapsed.toFixed(2)}s. Bytes read: ${(totalBytes2 / 1024 / 1024).toFixed(2)} MB`);
        resolve();
      });
      throttle.on('error', (err: any) => {
        console.log(`Throttled stream error: ${err.message}`);
        resolve();
      });
    });
  } catch (e: any) {
    console.error(`Throttled setup failed: ${e.message}`);
  }
}

run().catch(console.error);
