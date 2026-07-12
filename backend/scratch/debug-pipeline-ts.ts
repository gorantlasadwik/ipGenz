/// <reference types="node" />
import axios from 'axios';
import { spawn } from 'child_process';
import { PassThrough, Transform } from 'stream';
const ffmpegStatic = require('ffmpeg-static');

class DebugTsParser extends Transform {
  private buf: Buffer = Buffer.alloc(0);
  private videoPid = -1;
  private audioPid = -1;
  private pmtPid = -1;
  private pktCount: Record<string, number> = { video: 0, audio: 0 };

  constructor(private name: string, private onPtsLog: (msg: string) => void) {
    super();
  }

  _transform(chunk: any, encoding: string, callback: () => void) {
    const dataBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.buf = Buffer.concat([this.buf, dataBuf]);
    const PACKET_SIZE = 188;
    while (this.buf.length >= PACKET_SIZE) {
      if (this.buf[0] !== 0x47) {
        const idx = this.buf.indexOf(0x47);
        if (idx === -1) { this.buf = Buffer.alloc(0); break; }
        this.buf = this.buf.subarray(idx);
        continue;
      }
      const pkt = this.buf.subarray(0, PACKET_SIZE);
      this.buf = this.buf.subarray(PACKET_SIZE);
      this.parsePkt(pkt);
    }
    this.push(chunk);
    callback();
  }

  private parsePkt(pkt: Buffer) {
    const pid = ((pkt[1] & 0x1F) << 8) | pkt[2];
    const hasAdaptation = (pkt[3] & 0x20) !== 0;
    const pusi = (pkt[1] & 0x40) !== 0;

    let payloadOff = 4;
    if (hasAdaptation) payloadOff += (pkt[4] + 1);

    if (pid === 0 && pusi && payloadOff < pkt.length) {
      const ptr = pkt[payloadOff];
      const base = payloadOff + 1 + ptr;
      if (base + 3 < pkt.length) {
        const tableId = pkt[base];
        const secLen = ((pkt[base + 1] & 0x0F) << 8) | pkt[base + 2];
        if (tableId === 0x00) {
          for (let j = base + 8; j < base + 3 + secLen - 4 && j + 3 < pkt.length; j += 4) {
            const prog = (pkt[j] << 8) | pkt[j + 1];
            if (prog !== 0) {
              this.pmtPid = ((pkt[j + 2] & 0x1F) << 8) | pkt[j + 3];
              break;
            }
          }
        }
      }
    } else if (pid === this.pmtPid && pusi && payloadOff < pkt.length) {
      const ptr = pkt[payloadOff];
      const base = payloadOff + 1 + ptr;
      if (base + 3 < pkt.length) {
        const tableId = pkt[base];
        const secLen = ((pkt[base + 1] & 0x0F) << 8) | pkt[base + 2];
        if (tableId === 0x02) {
          const progInfoLen = ((pkt[base + 10] & 0x0F) << 8) | pkt[base + 11];
          let k = base + 12 + progInfoLen;
          while (k < base + 3 + secLen - 4 && k + 4 < pkt.length) {
            const streamType = pkt[k];
            const esPid = ((pkt[k + 1] & 0x1F) << 8) | pkt[k + 2];
            const esLen = ((pkt[k + 3] & 0x0F) << 8) | pkt[k + 4];
            if ([0x01, 0x02, 0x1B, 0x24].includes(streamType)) this.videoPid = esPid;
            if ([0x03, 0x04, 0x0F, 0x11, 0x81, 0x06, 0x87].includes(streamType)) this.audioPid = esPid;
            k += 5 + esLen;
          }
        }
      }
    }

    if (pusi && (pid === this.videoPid || pid === this.audioPid)) {
      const ptr = hasAdaptation ? 1 + pkt[4] : 0;
      let pesBase = 4 + ptr;
      if (pesBase + 10 < pkt.length) {
        if (pkt[pesBase] === 0x00 && pkt[pesBase + 1] === 0x00 && pkt[pesBase + 2] === 0x01) {
          const flags = pkt[pesBase + 7];
          const ptsFlags = (flags & 0xC0) >> 6;
          let ptsBase = pesBase + 9;
          if ((ptsFlags === 2 || ptsFlags === 3) && ptsBase + 4 < pkt.length) {
            const ptsVal = (BigInt(pkt[ptsBase] & 0x0E) << 29n) |
                           (BigInt(pkt[ptsBase + 1]) << 22n) |
                           (BigInt(pkt[ptsBase + 2] & 0xFE) << 14n) |
                           (BigInt(pkt[ptsBase + 3]) << 7n) |
                           (BigInt(pkt[ptsBase + 4] & 0xFE) >> 1n);
            
            const type = pid === this.videoPid ? 'video' : 'audio';
            this.pktCount[type]++;
            const count = this.pktCount[type];
            this.onPtsLog(`[${this.name}] ${type.toUpperCase()} Pkt #${count} PTS:${ptsVal} (${(Number(ptsVal)/90000).toFixed(3)}s)`);
          }
        }
      }
    }
  }
}

async function run() {
  const url = 'http://buxplay.org:8080/live/38485858999/83848595595/135457.ts';
  const headers = { 'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16' };

  console.log('1. Spawning FFmpeg transcode process with -debug_ts...');
  const args = [
    '-debug_ts',
    '-fflags', '+genpts+discardcorrupt+igndts',
    '-i', 'pipe:0',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-avoid_negative_ts', 'make_zero',
    '-f', 'mpegts', 'pipe:1'
  ];
  
  const ffmpeg = spawn(ffmpegStatic, args);
  const stitcher = new PassThrough();
  stitcher.pipe(ffmpeg.stdin);

  const logLimit = 5;
  const phaseLogs: Record<string, Record<string, number>> = {
    PROVIDER_PHASE1: { video: 0, audio: 0 },
    PROVIDER_PHASE2: { video: 0, audio: 0 },
    OUTPUT_PHASE1: { video: 0, audio: 0 },
    OUTPUT_PHASE2: { video: 0, audio: 0 },
  };

  let currentPhase = 'PHASE1';

  const rawParser = new DebugTsParser('RAW_PROVIDER', (msg) => {
    const type = msg.includes('VIDEO') ? 'video' : 'audio';
    const key = `PROVIDER_${currentPhase}`;
    phaseLogs[key] = phaseLogs[key] || { video: 0, audio: 0 };
    phaseLogs[key][type]++;
    if (phaseLogs[key][type] <= logLimit) {
      console.log(`[${key}] ${msg}`);
    }
  });

  rawParser.pipe(stitcher);

  const outParser = new DebugTsParser('FFMPEG_OUTPUT', (msg) => {
    const type = msg.includes('VIDEO') ? 'video' : 'audio';
    const key = `OUTPUT_${currentPhase}`;
    phaseLogs[key] = phaseLogs[key] || { video: 0, audio: 0 };
    phaseLogs[key][type]++;
    if (phaseLogs[key][type] <= logLimit) {
      console.log(`[${key}] ${msg}`);
    }
  });
  ffmpeg.stdout.pipe(outParser);

  ffmpeg.stderr.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const l = line.toLowerCase();
      if (l.includes('demuxer') || l.includes('muxer') || l.includes('timestamp') || l.includes('gap')) {
        console.log(`[FFMPEG_DEBUG] ${line.trim()}`);
      }
    }
  });

  console.log('2. Requesting first segment from provider...');
  let totalBytes = 0;
  const res1 = await axios.get(url, { responseType: 'stream', headers });
  
  await new Promise<void>((resolve) => {
    res1.data.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      rawParser.write(chunk);
      if (totalBytes > 3 * 1024 * 1024) {
        console.log(`\n=== ABORTING FIRST CONNECTION AFTER ${totalBytes} BYTES ===\n`);
        res1.data.destroy();
        resolve();
      }
    });
    res1.data.on('end', resolve);
  });

  await new Promise(r => setTimeout(r, 500));

  console.log('\n3. Switching to Phase 2 (Reconnect)...');
  currentPhase = 'PHASE2';

  const res2 = await axios.get(url, { responseType: 'stream', headers });
  
  await new Promise<void>((resolve) => {
    let bytes2 = 0;
    res2.data.on('data', (chunk: Buffer) => {
      bytes2 += chunk.length;
      rawParser.write(chunk);
      if (bytes2 > 3 * 1024 * 1024) {
        console.log(`\n=== ENDING TEST ===\n`);
        res2.data.destroy();
        resolve();
      }
    });
    res2.data.on('end', resolve);
  });

  stitcher.end();
  ffmpeg.kill('SIGKILL');
}

run().catch(console.error);
