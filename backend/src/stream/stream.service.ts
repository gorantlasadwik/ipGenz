import { Injectable, Logger, NotFoundException, HttpException, HttpStatus, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom } from 'rxjs';
import type { Response } from 'express';
import { CodecService } from './codec.service';
import { ContentType } from '@prisma/client';
import { spawn } from 'child_process';
import { PassThrough, Transform, Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { ChannelWorker } from './channel-worker';

const keepAliveHttpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 1000 });
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 });

const ffmpegStatic = require('ffmpeg-static');

class TranscodeCacheStream extends Readable {
  private queue: Buffer[] = [];
  private totalBytes = 0;
  private maxCacheBytes = 10 * 1024 * 1024; // 10MB cache (approx 20 seconds of video)
  private isDestroyed = false;
  private isPushing = false;

  constructor() {
    super({ highWaterMark: 1024 * 1024 * 5 });
  }

  writeChunk(chunk: Buffer) {
    if (this.isDestroyed) return;
    this.queue.push(chunk);
    this.totalBytes += chunk.length;

    while (this.totalBytes > this.maxCacheBytes && this.queue.length > 1) {
      const oldest = this.queue.shift();
      if (oldest) {
        this.totalBytes -= oldest.length;
      }
    }
    this.flush();
  }

  private flush() {
    if (this.isDestroyed || this.isPushing) return;
    this.isPushing = true;

    while (this.queue.length > 0) {
      const chunk = this.queue[0];
      if (this.push(chunk)) {
        this.queue.shift();
        this.totalBytes -= chunk.length;
      } else {
        break;
      }
    }

    this.isPushing = false;
  }

  _read(size: number) {
    this.flush();
  }

  destroy(error?: Error): this {
    this.isDestroyed = true;
    this.queue = [];
    this.totalBytes = 0;
    super.destroy(error);
    return this;
  }

  getBufferedBytes(): number {
    return this.totalBytes;
  }
}

class TsDiagnosticsTransform extends Transform {
  private readonly log = new Logger('TsDiagnostics');
  private buf = Buffer.alloc(0);
  private lastBpsLog = Date.now();
  private bytesThisSecond = 0;
  private videoPid = -1;
  private audioPids: number[] = [];
  private pmtPid = -1;
  private lastCc: Record<number, number> = {};
  
  // Timestamps
  private firstPcr: bigint | null = null;
  private lastPcr: bigint | null = null;
  private firstPts: Record<number, bigint> = {};
  private lastPts: Record<number, bigint> = {};

  constructor(private channelId: string) {
    super();
    this.log.log(`[INIT] TsDiagnosticsTransform spawned for channel: ${channelId}`);
  }

  _transform(chunk: Buffer, encoding: string, callback: Function) {
    this.bytesThisSecond += chunk.length;
    const now = Date.now();
    if (now - this.lastBpsLog >= 1000) {
      const elapsed = (now - this.lastBpsLog) / 1000;
      const kbps = ((this.bytesThisSecond / 1024) / elapsed).toFixed(2);
      this.log.log(`[SPEED_TRACKER][Channel:${this.channelId}] Rate: ${kbps} KB/s`);
      this.bytesThisSecond = 0;
      this.lastBpsLog = now;
    }

    this.buf = Buffer.concat([this.buf, chunk]);
    const PACKET_SIZE = 188;
    const SYNC_BYTE = 0x47;

    while (this.buf.length >= PACKET_SIZE) {
      if (this.buf[0] !== SYNC_BYTE) {
        const idx = this.buf.indexOf(SYNC_BYTE);
        if (idx === -1) {
          this.buf = Buffer.alloc(0);
          break;
        }
        this.buf = this.buf.subarray(idx);
        continue;
      }

      const pkt = this.buf.subarray(0, PACKET_SIZE);
      this.buf = this.buf.subarray(PACKET_SIZE);
      this.analyzePacket(pkt);
    }

    this.push(chunk);
    callback();
  }

  private analyzePacket(pkt: Buffer) {
    const pid = ((pkt[1] & 0x1F) << 8) | pkt[2];
    const cc = pkt[3] & 0x0F;
    const hasAdaptation = (pkt[3] & 0x20) !== 0;
    const hasPayload = (pkt[3] & 0x10) !== 0;

    if (hasPayload) {
      const last = this.lastCc[pid];
      if (last !== undefined) {
        const expected = (last + 1) % 16;
        if (cc !== expected && cc !== last) {
          this.log.warn(`[CC_GAP][PID:${pid}] Discontinuity! Expected ${expected}, got ${cc}`);
        }
      }
      this.lastCc[pid] = cc;
    }

    if (hasAdaptation) {
      const adLen = pkt[4];
      if (adLen > 0 && (pkt[5] & 0x10) !== 0 && adLen >= 6) {
        const pcrBase = (BigInt(pkt[6]) << 25n) |
                        (BigInt(pkt[7]) << 17n) |
                        (BigInt(pkt[8]) << 9n) |
                        (BigInt(pkt[9]) << 1n) |
                        (BigInt(pkt[10] & 0x80) >> 7n);
        const pcrExt = (BigInt(pkt[10] & 0x01) << 8n) | BigInt(pkt[11]);
        const pcrVal = pcrBase * 300n + pcrExt;
        if (this.firstPcr === null) {
          this.firstPcr = pcrVal;
          this.log.log(`[PCR_INIT] First PCR: ${pcrVal}`);
        }
        this.lastPcr = pcrVal;
      }
    }

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
          const newAudio: number[] = [];
          let newVideo = -1;
          while (k < base + 3 + secLen - 4 && k + 4 < pkt.length) {
            const streamType = pkt[k];
            const esPid = ((pkt[k + 1] & 0x1F) << 8) | pkt[k + 2];
            const esLen = ((pkt[k + 3] & 0x0F) << 8) | pkt[k + 4];
            if ([0x01, 0x02, 0x1B, 0x24].includes(streamType)) newVideo = esPid;
            if ([0x03, 0x04, 0x0F, 0x11, 0x81, 0x06, 0x87].includes(streamType)) newAudio.push(esPid);
            k += 5 + esLen;
          }
          if (newVideo !== this.videoPid || JSON.stringify(newAudio) !== JSON.stringify(this.audioPids)) {
            this.videoPid = newVideo;
            this.audioPids = newAudio;
            this.log.log(`[PIDs_DETECTED] Video PID: ${this.videoPid}, Audio PIDs: ${JSON.stringify(this.audioPids)}`);
          }
        }
      }
    }

    if (pusi && (pid === this.videoPid || this.audioPids.includes(pid))) {
      const ptr = hasAdaptation ? 1 + pkt[4] : 0;
      let pesBase = 4 + ptr;
      if (pesBase + 10 < pkt.length) {
        if (pkt[pesBase] === 0x00 && pkt[pesBase + 1] === 0x00 && pkt[pesBase + 2] === 0x01) {
          const flags = pkt[pesBase + 7];
          const ptsFlags = (flags & 0xC0) >> 6;
          let ptsBase = pesBase + 9;

          if (ptsFlags === 2 || ptsFlags === 3) {
            const ptsVal = (BigInt(pkt[ptsBase] & 0x0E) << 29n) |
                           (BigInt(pkt[ptsBase + 1]) << 22n) |
                           (BigInt(pkt[ptsBase + 2] & 0xFE) << 14n) |
                           (BigInt(pkt[ptsBase + 3]) << 7n) |
                           (BigInt(pkt[ptsBase + 4] & 0xFE) >> 1n);

            const isFirst = this.firstPts[pid] === undefined;
            if (isFirst) {
              this.firstPts[pid] = ptsVal;
              this.log.log(`[PTS_INIT][PID:${pid}] First PTS: ${ptsVal}`);
            }

            const last = this.lastPts[pid];
            if (last !== undefined) {
              const diff = ptsVal - last;
              if (diff < 0n) {
                this.log.warn(`[PTS_RESET][PID:${pid}] PTS jumped backward from ${last} to ${ptsVal} (Diff: ${diff})`);
              }
            }
            this.lastPts[pid] = ptsVal;
          }
        }
      }
    }
  }

  public getSegmentDuration(): number {
    let maxDiff = 0n;
    for (const pidStr of Object.keys(this.firstPts)) {
      const pid = Number(pidStr);
      const first = this.firstPts[pid];
      const last = this.lastPts[pid];
      if (first !== undefined && last !== undefined) {
        const diff = last - first;
        if (diff > maxDiff) maxDiff = diff;
      }
    }
    const duration = Number(maxDiff) / 90000;
    return duration > 0 && duration < 3600 ? duration : 30.0;
  }
}

interface HlsSession {
  channelId: string;
  ffmpegProcess: any;
  stitcher: PassThrough;
  lastActive: number;
  tempDir: string;
  isClientDisconnected: boolean;
}

@Injectable()
export class StreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamService.name);
  private hlsCleanupInterval: any = null;

  // ─── Channel Worker Pool (one worker per active live channel) ──────────────
  private channelWorkers = new Map<string, ChannelWorker>();
  /** Last active timestamp per channel to detect idle channels */
  private hlsLastActive = new Map<string, number>();
  /** Pending destroy timers — workers are kept alive for 30s after last subscriber */
  private workerIdleTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private codecService: CodecService,
  ) {}

  onModuleInit() {
    const mainHlsDir = path.join(process.cwd(), 'temp_hls');
    if (fs.existsSync(mainHlsDir)) {
      try {
        fs.rmSync(mainHlsDir, { recursive: true, force: true });
      } catch (e: any) {
        this.logger.error(`Failed to clean main HLS dir: ${e.message}`);
      }
    }
    fs.mkdirSync(mainHlsDir, { recursive: true });
    // Clean up idle segmenters every 10 seconds
    this.hlsCleanupInterval = setInterval(() => this.cleanupExpiredWorkers(), 10000);
  }

  onModuleDestroy() {
    if (this.hlsCleanupInterval) {
      clearInterval(this.hlsCleanupInterval);
    }

    // Destroy all active channel workers and clear timers
    for (const [id, timer] of this.workerIdleTimers) {
      clearTimeout(timer);
    }
    this.workerIdleTimers.clear();
    for (const worker of this.channelWorkers.values()) {
      worker.destroy();
    }
    this.channelWorkers.clear();
    this.hlsLastActive.clear();

    const mainHlsDir = path.join(process.cwd(), 'temp_hls');
    if (fs.existsSync(mainHlsDir)) {
      try {
        fs.rmSync(mainHlsDir, { recursive: true, force: true });
      } catch (e: any) {
        this.logger.error(`Failed to delete main HLS dir on destroy: ${e.message}`);
      }
    }
  }

  private cleanupExpiredWorkers() {
    const now = Date.now();
    const expiryThreshold = 30000; // 30 seconds idle
    for (const [channelId, worker] of this.channelWorkers.entries()) {
      const lastActive = this.hlsLastActive.get(channelId) || 0;
      if (now - lastActive > expiryThreshold) {
        this.logger.log(`[WorkerPool] Channel ${channelId} has been idle for 30s — destroying worker`);
        worker.destroy();
        this.channelWorkers.delete(channelId);
        this.hlsLastActive.delete(channelId);
      }
    }
  }

  /**
   * Get an existing ChannelWorker for this channel, or create and start one.
   * Workers are shared across all browser subscribers watching the same channel.
   */
  private async getOrCreateWorker(
    channelId: string,
    streamUrl: string,
  ): Promise<ChannelWorker> {
    // Cancel any pending idle-destroy timer
    const idleTimer = this.workerIdleTimers.get(channelId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.workerIdleTimers.delete(channelId);
    }

    const existing = this.channelWorkers.get(channelId);
    if (existing && existing.isRunning) {
      return existing;
    }

    if (existing) {
      existing.destroy();
      this.channelWorkers.delete(channelId);
    }

    this.logger.log(`[WorkerPool] Creating new Live HLS Worker for channel ${channelId}`);
    const tempDir = path.join(process.cwd(), 'temp_hls', channelId);
    const worker = new ChannelWorker({
      channelId,
      streamUrl,
      tempDir,
    });
    this.channelWorkers.set(channelId, worker);
    await worker.start();
    return worker;
  }

  /**
   * Release worker subscriber. If no subscribers remain, schedules worker destroy in 30s.
   */
  private releaseWorkerSubscriber(channelId: string): void {
    const worker = this.channelWorkers.get(channelId);
    if (!worker) return;
    worker.decrementSubscribers();

    if (worker.subscriberCount === 0) {
      this.logger.log(`[WorkerPool] No active subscribers for ${channelId} — scheduling idle destroy in 30s`);
      const timer = setTimeout(() => {
        const w = this.channelWorkers.get(channelId);
        if (w && w.subscriberCount === 0) {
          this.logger.log(`[WorkerPool] Destroying idle worker for ${channelId}`);
          w.destroy();
          this.channelWorkers.delete(channelId);
          this.hlsLastActive.delete(channelId);
        }
        this.workerIdleTimers.delete(channelId);
      }, 30_000);
      this.workerIdleTimers.set(channelId, timer);
    }
  }

  /**
   * Pure Node.js MPEG-TS PID filter for audio track selection.
   * Unlike FFmpeg (which gets blocked by IPTV providers on Render), this uses the same
   * Node.js HTTP proxy that already works. Reads 188-byte TS packets, parses PAT→PMT to
   * discover video & audio PIDs, then only forwards video PID + selected audio PID.
   */
  async handlePidFilterStream(streamUrl: string, audioTrackIndex: number, res: Response) {
    this.logger.log(`PID-filter stream: audioTrack=${audioTrackIndex}, url=${streamUrl}`);
    const PACKET_SIZE = 188;
    const SYNC_BYTE = 0x47;

    let response: any;
    try {
      response = await firstValueFrom(
        this.httpService.get(streamUrl, {
          responseType: 'stream',
          decompress: false,
          headers: { 
            'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16', 
            'Accept': '*/*',
            'Accept-Encoding': 'identity'
          },
        }).pipe(
          catchError(err => { throw new HttpException('Provider Stream Offline', HttpStatus.BAD_GATEWAY); })
        )
      );
    } catch (e) {
      if (!res.headersSent) res.status(502).send('Stream Unavailable');
      return;
    }

    res.set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'no-cache, no-store',
      'Access-Control-Allow-Origin': '*',
    });

    let buf = Buffer.alloc(0);
    let pmtPid = -1;
    let videoPid = -1;
    const audioPids: number[] = [];
    let selectedAudioPid = -1;
    let pmtParsed = false;

    const parseSection = (data: Buffer, offset: number): void => {
      const ptr = data[offset];
      const base = offset + 1 + ptr;
      if (base + 3 >= data.length) return;
      const tableId = data[base];
      const secLen = ((data[base + 1] & 0x0F) << 8) | data[base + 2];
      if (tableId === 0x00) {
        for (let j = base + 8; j < base + 3 + secLen - 4; j += 4) {
          const prog = (data[j] << 8) | data[j + 1];
          if (prog !== 0) { pmtPid = ((data[j + 2] & 0x1F) << 8) | data[j + 3]; break; }
        }
      } else if (tableId === 0x02 && !pmtParsed) {
        const progInfoLen = ((data[base + 10] & 0x0F) << 8) | data[base + 11];
        let k = base + 12 + progInfoLen;
        while (k < base + 3 + secLen - 4 && k + 4 < data.length) {
          const streamType = data[k];
          const esPid = ((data[k + 1] & 0x1F) << 8) | data[k + 2];
          const esLen = ((data[k + 3] & 0x0F) << 8) | data[k + 4];
          if ([0x01, 0x02, 0x1B, 0x24].includes(streamType) && videoPid === -1) videoPid = esPid;
          if ([0x03, 0x04, 0x0F, 0x11, 0x81, 0x06, 0x87].includes(streamType)) audioPids.push(esPid);
          k += 5 + esLen;
        }
        if (audioPids.length > 0) {
          selectedAudioPid = audioPids[Math.min(audioTrackIndex, audioPids.length - 1)];
          this.logger.log(`PID filter: videoPid=${videoPid}, audioPids=${JSON.stringify(audioPids)}, selected=${selectedAudioPid}`);
          pmtParsed = true;
        }
      }
    };

    response.data.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= PACKET_SIZE) {
        if (buf[0] !== SYNC_BYTE) {
          const idx = buf.indexOf(SYNC_BYTE);
          if (idx === -1) { buf = Buffer.alloc(0); break; }
          buf = Buffer.from(buf.subarray(idx)); continue;
        }
        // CRITICAL: Copy the packet bytes — subarray is a VIEW, not a copy!
        // If we don't copy, buf reassignment below will corrupt pkt before it's written.
        const pkt = Buffer.from(buf.subarray(0, PACKET_SIZE));
        buf = Buffer.from(buf.subarray(PACKET_SIZE));
        const pid = ((pkt[1] & 0x1F) << 8) | pkt[2];
        const pusi = (pkt[1] & 0x40) !== 0;
        const afCtrl = (pkt[3] & 0x30) >> 4;
        let payloadOff = 4;
        if (afCtrl === 3) payloadOff += (pkt[4] + 1);
        if (pid === 0 && pusi && pmtPid === -1) parseSection(pkt, payloadOff);
        if (pid === pmtPid && pusi && !pmtParsed) parseSection(pkt, payloadOff);
        // Forward: PAT, null, PMT, video, selected audio; drop other audio PIDs
        const pass = pid === 0 || pid === 0x1FFF || pid === pmtPid || pid === videoPid
          || !pmtParsed || pid === selectedAudioPid;
        if (pass && !res.writableEnded) res.write(pkt);
      }
    });

    response.data.on('end', () => { if (!res.writableEnded) res.end(); });
    response.data.on('error', (e: any) => { this.logger.error('Stream error:', e.message); });
    res.on('close', () => { try { response.data.destroy(); } catch (_) {} });
  }

  async handleTranscodeStream(
    streamUrl: string,
    transcodeType: 'AUDIO' | 'VIDEO',
    res: Response,
    audioTrack?: number,
    startTime?: number,
    isLive = false,
    channelId = 'unknown-transcode',
    transcode?: string,
  ) {
    this.logger.log(
      `[FFMPEG_START_INIT][Channel:${channelId}] Preparing FFmpeg transcode. Type: ${transcodeType}, URL: ${streamUrl}, ` +
      `AudioTrack: ${audioTrack ?? 'default'}, Start: ${startTime ?? 0}, Live: ${isLive}`
    );

    const streamHeaders = {
      'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
    };

    if (isLive) {
      res.set({
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      });

      const stitcher = new PassThrough();
      let clientDisconnected = false;
      stitcher.pipe(res);

      res.on('close', () => {
        clientDisconnected = true;
        this.logger.log(`[Transcode+Stitch][Channel:${channelId}] Client left — cleaning up.`);
        try { stitcher.destroy(); } catch (_) {}
      });

      this.pipeSegmentsInfinitely(
        channelId,
        streamUrl,
        streamHeaders,
        stitcher,
        () => clientDisconnected,
        transcodeType,
        audioTrack,
        transcode,
      ).catch(e => {
        this.logger.error(`[FFMPEG_STITCHER_ERROR][Channel:${channelId}] Transcode loop crashed: ${e.message}`);
        if (!res.writableEnded) res.end();
      });
      return;
    }

    // ── VOD: single-pass ───────────────────────────────────────────────────
    let vodResponse: any = null;
    try {
      vodResponse = await firstValueFrom(
        this.httpService.get(streamUrl, {
          responseType: 'stream',
          decompress: false,
          headers: streamHeaders,
        }).pipe(
          catchError(err => {
            this.logger.error(`Failed to connect to provider for transcode: ${err.message}`);
            throw new HttpException('Provider Stream Offline', HttpStatus.BAD_GATEWAY);
          })
        )
      );
    } catch (e) {
      if (!res.headersSent) res.status(502).send('Stream Unavailable');
      return;
    }

    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;
    const args: string[] = [];

    if (startTime !== undefined && startTime > 0) {
      args.push('-ss', startTime.toString());
    }

    args.push('-debug_ts');
    args.push('-fflags', '+genpts+discardcorrupt+igndts+nobuffer');
    args.push('-i', 'pipe:0');

    if (audioTrack !== undefined) {
      args.push('-map', '0:v?', '-map', `0:a:${audioTrack}`);
    }

    const isAudioTranscodeRequired = transcode === 'audio';

    if (transcodeType === 'AUDIO') {
      args.push('-c:v', 'copy');
      if (isAudioTranscodeRequired) {
        args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
      } else {
        args.push('-c:a', 'copy');
      }
    } else {
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23');
      args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
    }

    args.push('-avoid_negative_ts', 'make_zero');
    args.push('-muxdelay', '0');
    args.push('-max_muxing_queue_size', '1024');
    args.push('-flush_packets', '1');
    args.push('-f', 'mpegts', 'pipe:1');

    res.set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    });

    this.logger.log(`[FFMPEG_SPAWNED][Channel:${channelId}] FFmpeg VOD child process spawned.`);
    const ffmpegProcess = spawn(ffmpegPath, args) as any;
    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (data: any) => {
      this.logger.warn(`[FFMPEG_STDERR][Channel:${channelId}] ${data.toString().trim()}`);
    });
    ffmpegProcess.on('error', (err: any) => {
      this.logger.error(`[FFMPEG_ERROR][Channel:${channelId}] Spawn failed: ${err.message}`);
    });

    ffmpegProcess.on('close', (code: any) => {
      this.logger.log(`[FFMPEG_EXIT][Channel:${channelId}] VOD Exited with code ${code}`);
      if (!res.writableEnded) res.end();
    });

    vodResponse.data.on('end', () => {
      this.logger.log(`[FFMPEG_STDIN_EOF][Channel:${channelId}] VOD response stream ended.`);
      try { ffmpegProcess.stdin.end(); } catch (_) {}
    });
    vodResponse.data.on('error', (err: any) => {
      this.logger.error(`[FFMPEG_STDIN_ERROR][Channel:${channelId}] Axios stream error: ${err.message}`);
      try { ffmpegProcess.stdin.end(); } catch (_) {}
    });

    res.on('close', () => {
      this.logger.log(`[FFMPEG_ABORT][Channel:${channelId}] VOD client disconnected — killing FFmpeg.`);
      try { vodResponse.data.destroy(); } catch (_) {}
      try { ffmpegProcess.stdin.destroy(); } catch (_) {}
      ffmpegProcess.kill('SIGKILL');
    });
  }

  /**
   * Segment stitcher — the heart of seamless live streaming.
   *
   * Continuously GETs the IPTV provider URL (which returns finite ~33s TS chunks)
   * and writes each chunk into `sink` WITHOUT ever closing it.  From the consumer's
   * perspective (mpegts.js / FFmpeg) this looks like one infinite HTTP stream:
   *   duration = Infinity, no EOF, no reload, no audio gap.
   *
   * Stops only when:
   *   • isClientDisconnected() returns true  (user navigated away)
   *   • 10 consecutive errors                (provider is down)
   *   • sink is destroyed externally
   */
  private async pipeSegmentsInfinitely(
    channelId: string,
    streamUrl: string,
    requestHeaders: Record<string, string>,
    sink: PassThrough,
    isClientDisconnected: () => boolean,
    transcodeType?: 'AUDIO' | 'VIDEO',
    audioTrack?: number,
    transcode?: string,
  ): Promise<void> {
    const useDynamicRestart = process.env.USE_DYNAMIC_FFMPEG_RESTART === 'true';
    let consecutiveErrors = 0;
    let totalBytesWritten = 0;
    const isAudioTranscodeRequired = transcode === 'audio';

    this.logger.log(
      `[StitcherStart][Channel:${channelId}] Starting pipe segments infinitely. ` +
      `TranscodeType: ${transcodeType || 'none'}, UseDynamicRestart: ${useDynamicRestart}, AudioTranscodeRequired: ${isAudioTranscodeRequired}`
    );

    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;

    // For single process (old implementation): spawn the single FFmpeg process here
    let singleFfmpegProcess: any = null;
    let singleStitcher: PassThrough | null = null;
    let singleCacheStream: TranscodeCacheStream | null = null;

    if (transcodeType && !useDynamicRestart) {
      this.logger.log(`[FFMPEG_SINGLE_SPAWN][Channel:${channelId}] Spawning single long-lived FFmpeg instance`);
      const args: string[] = [
        '-debug_ts',
        '-fflags', '+genpts+discardcorrupt+igndts+nobuffer',
        '-i', 'pipe:0',
      ];
      if (audioTrack !== undefined) {
        args.push('-map', '0:v?', '-map', `0:a:${audioTrack}`);
      }
      if (transcodeType === 'AUDIO') {
        args.push('-c:v', 'copy');
        if (isAudioTranscodeRequired) {
          args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
        } else {
          args.push('-c:a', 'copy');
        }
      } else {
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23');
        if (isAudioTranscodeRequired) {
          args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
        } else {
          args.push('-c:a', 'copy');
        }
      }
      args.push('-avoid_negative_ts', 'make_zero');
      args.push('-muxdelay', '0');
      args.push('-max_muxing_queue_size', '1024');
      args.push('-flush_packets', '1');
      args.push('-f', 'mpegts', 'pipe:1');

      singleFfmpegProcess = spawn(ffmpegPath, args) as any;
      singleStitcher = new PassThrough();
      singleStitcher.pipe(singleFfmpegProcess.stdin);

      singleCacheStream = new TranscodeCacheStream();
      singleFfmpegProcess.stdout.on('data', (chunk: Buffer) => {
        if (singleCacheStream) singleCacheStream.writeChunk(chunk);
      });
      singleCacheStream.pipe(sink, { end: false });

      singleFfmpegProcess.stderr.on('data', (data: any) => {
        this.logger.warn(`[FFMPEG_SINGLE_STDERR][Channel:${channelId}] ${data.toString().trim()}`);
      });
      singleFfmpegProcess.on('error', (err: any) => {
        this.logger.error(`[FFMPEG_SINGLE_ERROR][Channel:${channelId}] process error: ${err.message}`);
      });
      singleFfmpegProcess.on('close', (code: any) => {
        this.logger.log(`[FFMPEG_SINGLE_EXIT][Channel:${channelId}] Single process exited with code ${code}`);
        if (!sink.writableEnded && !sink.destroyed) sink.end();
      });
    }

    let cumulativeDurationSec = 0;
    let lastEofTime: number | null = null;
    let activeResponseStream: any = null;
    let dynamicCacheStream: TranscodeCacheStream | null = null;

    while (!isClientDisconnected() && !sink.writableEnded && !sink.destroyed) {
      if (singleFfmpegProcess && singleFfmpegProcess.killed) {
        this.logger.warn(`[StitcherLoop][Channel:${channelId}] Single FFmpeg process died, stopping loop.`);
        break;
      }

      let ffmpegProcess: any = null;
      let tsDiagnostics: TsDiagnosticsTransform | null = null;

      try {
        this.logger.log(`[PROVIDER_CONNECT][Channel:${channelId}] Connecting to: ${streamUrl}`);
        const isHttps = streamUrl.startsWith('https');
        const response = await firstValueFrom(
          this.httpService.get(streamUrl, {
            responseType: 'stream',
            decompress: false,
            headers: requestHeaders,
            httpAgent: isHttps ? undefined : keepAliveHttpAgent,
            httpsAgent: isHttps ? keepAliveHttpsAgent : undefined,
          }).pipe(catchError(err => { throw err; }))
        );
        activeResponseStream = response.data;

        this.logger.log(`[PROVIDER_HEADERS][Channel:${channelId}] Status ${response.status}. Headers: ${JSON.stringify(response.headers)}`);
        consecutiveErrors = 0; // reset

        await new Promise<void>((resolve, reject) => {
          if (isClientDisconnected() || sink.writableEnded || sink.destroyed) {
            try { response.data.destroy(); } catch (_) {}
            resolve();
            return;
          }

          tsDiagnostics = new TsDiagnosticsTransform(channelId);

          let inputNode: any = response.data;
          let outputNode: any = null;

          if (transcodeType && useDynamicRestart) {
            const eofDelay = lastEofTime ? (Date.now() - lastEofTime) : 0;
            const ffmpegStartTime = Date.now();

            this.logger.log(
              `[TRANSCODE_RECONNECT][Channel:${channelId}] Spawning fresh FFmpeg. ` +
              `Time since provider EOF: ${eofDelay} ms. Offset: ${cumulativeDurationSec.toFixed(3)}s`
            );

            const args: string[] = [
              '-debug_ts',
              '-fflags', '+genpts+discardcorrupt+igndts+nobuffer',
              '-i', 'pipe:0',
            ];
            if (audioTrack !== undefined) {
              args.push('-map', '0:v?', '-map', `0:a:${audioTrack}`);
            }
            if (transcodeType === 'AUDIO') {
              args.push('-c:v', 'copy');
              if (isAudioTranscodeRequired) {
                args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
              } else {
                args.push('-c:a', 'copy');
              }
            } else {
              args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23');
              if (isAudioTranscodeRequired) {
                args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
              } else {
                args.push('-c:a', 'copy');
              }
            }
            args.push('-avoid_negative_ts', 'make_zero');
            args.push('-muxdelay', '0');
            args.push('-max_muxing_queue_size', '1024');
            args.push('-flush_packets', '1');
            args.push('-output_ts_offset', cumulativeDurationSec.toFixed(3));
            args.push('-f', 'mpegts', 'pipe:1');

            ffmpegProcess = spawn(ffmpegPath, args) as any;
            inputNode.pipe(ffmpegProcess.stdin);
            outputNode = ffmpegProcess.stdout;

            let firstPacketLogged = false;
            ffmpegProcess.stdout.once('data', () => {
              if (!firstPacketLogged) {
                firstPacketLogged = true;
                const timeToFirstPacket = Date.now() - ffmpegStartTime;
                const totalTimeToBrowser = lastEofTime ? (Date.now() - lastEofTime) : 0;
                this.logger.log(
                  `[TRANSCODE_RECONNECT_INSTRUMENTATION][Channel:${channelId}] ` +
                  `FFmpeg start to first packet: ${timeToFirstPacket} ms. ` +
                  `Total EOF-to-client-write latency: ${totalTimeToBrowser} ms.`
                );
              }
            });

            ffmpegProcess.stderr.on('data', (data: any) => {
              this.logger.warn(`[FFMPEG_STDERR][Channel:${channelId}] ${data.toString().trim()}`);
            });
            ffmpegProcess.on('error', (err: any) => {
              this.logger.error(`[FFMPEG_ERROR][Channel:${channelId}] process error: ${err.message}`);
            });
            ffmpegProcess.on('close', (code: any) => {
              this.logger.log(`[FFMPEG_CLOSE][Channel:${channelId}] Process exited with code ${code}`);
            });
          } else if (transcodeType && !useDynamicRestart) {
            outputNode = null;
            inputNode.pipe(tsDiagnostics, { end: false });
            tsDiagnostics.pipe(singleStitcher!, { end: false });
          } else {
            outputNode = inputNode;
          }

          dynamicCacheStream = null;
          if (outputNode) {
            if (transcodeType && useDynamicRestart) {
              dynamicCacheStream = new TranscodeCacheStream();
              outputNode.on('data', (chunk: Buffer) => {
                if (dynamicCacheStream) dynamicCacheStream.writeChunk(chunk);
              });
              dynamicCacheStream.pipe(tsDiagnostics, { end: false });
            } else {
              outputNode.pipe(tsDiagnostics, { end: false });
            }
            tsDiagnostics.pipe(sink, { end: false });
          }

          let heartbeatTimer: NodeJS.Timeout | null = null;
          const resetHeartbeat = () => {
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            heartbeatTimer = setTimeout(() => {
              this.logger.warn(`[PROVIDER_TIMEOUT][Channel:${channelId}] No data received from provider for 3000ms. Reconnecting...`);
              try { response.data.destroy(); } catch (_) {}
            }, 3000);
          };

          const cleanup = () => {
            if (heartbeatTimer) {
              clearTimeout(heartbeatTimer);
              heartbeatTimer = null;
            }
            if (dynamicCacheStream) {
              try { dynamicCacheStream.destroy(); } catch (_) {}
              dynamicCacheStream = null;
            }
            activeResponseStream = null;
            try { response.data.unpipe(); } catch (_) {}
            try { if (tsDiagnostics) tsDiagnostics.unpipe(); } catch (_) {}
            try { if (outputNode) outputNode.unpipe(); } catch (_) {}
            response.data.removeAllListeners();

            if (ffmpegProcess) {
              try { ffmpegProcess.stdin.destroy(); } catch (_) {}
              try { ffmpegProcess.stdout.destroy(); } catch (_) {}
              try { ffmpegProcess.kill('SIGKILL'); } catch (_) {}
            }
          };

          // Start the inactivity watchdog timer
          resetHeartbeat();

          response.data.on('data', (chunk: Buffer) => {
            resetHeartbeat();
            totalBytesWritten += chunk.length;
          });

          response.data.on('end', () => {
            lastEofTime = Date.now();

            if (tsDiagnostics) {
              const segDur = tsDiagnostics.getSegmentDuration();
              this.logger.log(`[PROVIDER_DISCONNECT][Channel:${channelId}] EOF reached. Segment duration: ${segDur.toFixed(3)}s. Total bytes: ${totalBytesWritten}`);
              cumulativeDurationSec += segDur;
            } else {
              this.logger.log(`[PROVIDER_DISCONNECT][Channel:${channelId}] EOF reached. Total bytes: ${totalBytesWritten}`);
            }

            cleanup();
            resolve();
          });

          response.data.on('error', (err: any) => {
            cleanup();
            this.logger.error(`[PROVIDER_ERROR][Channel:${channelId}] Read error: ${err.message}`);
            reject(err);
          });
        });

        if (!isClientDisconnected()) {
          await new Promise(r => setTimeout(r, 50));
        }

      } catch (err: any) {
        consecutiveErrors++;
        const delay = Math.min(500 * consecutiveErrors, 5000);
        this.logger.warn(
          `[SegmentStitcher] Segment error #${consecutiveErrors}: ${err.message}. ` +
          `Retry in ${delay}ms`
        );
        if (consecutiveErrors >= 10) {
          this.logger.error('[SegmentStitcher] Too many consecutive errors — stopping loop');
          break;
        }
        await new Promise(r => setTimeout(r, delay));
      }
    }

    if (singleFfmpegProcess) {
      try { singleStitcher!.destroy(); } catch (_) {}
      try { singleFfmpegProcess.stdin.destroy(); } catch (_) {}
      try { singleFfmpegProcess.kill('SIGKILL'); } catch (_) {}
    }
    if (singleCacheStream) {
      try { singleCacheStream.destroy(); } catch (_) {}
    }

    if (!sink.writableEnded && !sink.destroyed) sink.end();
    this.logger.log(`[STITCHER_STOP][Channel:${channelId}] Loop stopped. Bytes: ${totalBytesWritten}`);
  }

  private isDolbyName(name?: string): boolean {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.includes('dolby') || 
           lower.includes('ac3') || 
           lower.includes('eac3') || 
           lower.includes('5.1') || 
           lower.includes('dd5') || 
           lower.includes('dd+') || 
           lower.includes('surround');
  }

  async proxyLiveStream(
    channelId: string,
    audioTrack: number | undefined,
    userId: string,
    res: Response,
    transcode?: string,
    req?: any,
  ) {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });
    if (!channel || !channel.streamUrl) {
      if (!res.headersSent) res.status(404).send('Channel not found');
      return;
    }

    const streamUrl = channel.streamUrl;

    this.logger.log(`[StreamService] Starting direct MPEG-TS stream for channel ${channelId}`);

    // Set headers for direct MPEG-TS streaming
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Connection', 'keep-alive');

    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;
    const isAudioTranscodeRequired = transcode === 'audio';
    const isHlsInput = streamUrl.toLowerCase().includes('m3u8');
    const inputArgs: string[] = [];

    if (!isHlsInput) {
      // Reconnect options for raw TS streams
      inputArgs.push(
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      );
    } else {
      // Reconnect options for HLS segments download
      inputArgs.push(
        '-reconnect', '1',
        '-reconnect_delay_max', '5'
      );
    }

    const args: string[] = [
      ...inputArgs,
      '-fflags', '+genpts+discardcorrupt+igndts',
      '-user_agent', 'VLC/3.0.16',
      '-i', streamUrl,

      // Map only first video stream and either the selected audio stream or all audio streams
      '-map', '0:v:0',
      audioTrack !== undefined ? '-map' : '-map',
      audioTrack !== undefined ? `0:a:${audioTrack}` : '0:a?',

      // Video: copy directly (0% CPU)
      '-c:v', 'copy',
    ];

    if (isAudioTranscodeRequired) {
      // Audio: transcode to standard AAC
      args.push(
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-ar', '48000'
      );
    } else {
      // Audio: copy directly (0% CPU)
      args.push('-c:a', 'copy');
    }

    // Output options (avoid negative timestamps, make zero, pipe to stdout)
    args.push(
      '-avoid_negative_ts', 'make_zero',
      '-max_muxing_queue_size', '4096',
      '-f', 'mpegts',
      'pipe:1'
    );

    this.logger.log(`[StreamService][Channel:${channelId}] Spawning FFmpeg direct proxy: ffmpeg ${args.join(' ')}`);

    const ffmpegProcess = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Pipe direct stdout to the client HTTP response
    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg.includes('Error') || msg.includes('error') || msg.includes('warning') || msg.includes('Warning')) {
        this.logger.warn(`[FFmpegStream:${channelId}] ${msg}`);
      }
    });

    ffmpegProcess.on('close', (code) => {
      this.logger.log(`[StreamService][Channel:${channelId}] FFmpeg process closed with code ${code}`);
      if (!res.writableEnded) {
        res.end();
      }
    });

    req.on('close', () => {
      this.logger.log(`[StreamService][Channel:${channelId}] Client connection closed. Terminating FFmpeg.`);
      try {
        ffmpegProcess.kill('SIGKILL');
      } catch (_) {}
    });
  }

  async getHlsPlaylist(channelId: string, userId: string, token: string, res: Response) {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });
    if (!channel || !channel.streamUrl) {
      throw new NotFoundException('Channel not found');
    }

    const streamUrl = channel.streamUrl;
    let worker = this.channelWorkers.get(channelId);

    if (!worker || !worker.isRunning) {
      try {
        worker = await this.getOrCreateWorker(channelId, streamUrl);
      } catch (err: any) {
        this.logger.error(`[StreamService] Failed to start Live HLS worker for ${channelId}: ${err.message}`);
        if (!res.headersSent) res.status(502).send('Stream Unavailable');
        return;
      }
    }

    // Keep active subscriber count and refresh lastActive activity
    worker.incrementSubscribers();
    this.hlsLastActive.set(channelId, Date.now());

    // Cancel any pending idle destroy timers since we have an active subscriber
    const idleTimer = this.workerIdleTimers.get(channelId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.workerIdleTimers.delete(channelId);
    }

    const tempDir = path.join(process.cwd(), 'temp_hls', channelId);
    const playlistPath = path.join(tempDir, 'playlist.m3u8');

    // Wait for the segmenter to output the playlist (max 8 seconds)
    let attempts = 0;
    while (!fs.existsSync(playlistPath) && attempts < 80) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!fs.existsSync(playlistPath)) {
      this.logger.error(`[StreamService] HLS playlist generation timed out for channel ${channelId}`);
      this.releaseWorkerSubscriber(channelId);
      if (!res.headersSent) res.status(504).send('Transcoding Timeout');
      return;
    }

    try {
      let content = fs.readFileSync(playlistPath, 'utf8');
      // Append token parameter to each segment URL so segment requests are authorized
      content = content.replace(/(seg_\d+\.ts)/g, `$1?token=${token}`);

      res.set({
        'Content-Type': 'application/x-mpegURL',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(content);
    } catch (e: any) {
      this.logger.error(`[StreamService] Error reading HLS playlist: ${e.message}`);
      this.releaseWorkerSubscriber(channelId);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  }

  async getHlsSegment(channelId: string, segmentName: string, res: Response) {
    this.hlsLastActive.set(channelId, Date.now());

    const worker = this.channelWorkers.get(channelId);
    if (!worker) {
      if (!res.headersSent) res.status(404).send('Session worker not found');
      return;
    }

    const tempDir = path.join(process.cwd(), 'temp_hls', channelId);
    const segmentPath = path.join(tempDir, segmentName);
    if (!fs.existsSync(segmentPath)) {
      if (!res.headersSent) res.status(404).send('Segment not found');
      return;
    }

    res.set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });

    const stream = fs.createReadStream(segmentPath);
    stream.on('end', () => {
      this.releaseWorkerSubscriber(channelId);
    });
    stream.on('error', () => {
      this.releaseWorkerSubscriber(channelId);
    });
    stream.pipe(res);
  }

  async getLiveStreamInfo(channelId: string, userId: string) {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    try {
      const probe = await this.codecService.probeStream(channel.streamUrl);
      return probe;
    } catch (err) {
      return { allAudioStreams: [] };
    }
  }

  async getMovieStreamInfo(movieId: string, userId: string) {
    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, provider: { userId } },
    });
    if (!movie) throw new NotFoundException('Movie not found');

    try {
      return await this.codecService.probeStream(movie.streamUrl);
    } catch (err) {
      return { allAudioStreams: [] };
    }
  }

  async proxyMovieStream(req: any, movieId: string, userId: string, res: Response, audioTrack?: number, start?: number, transcode?: string) {
    this.logger.log(`Proxying Movie Stream: ${movieId}, AudioTrack: ${audioTrack}, Start: ${start}, Transcode: ${transcode}`);

    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, provider: { userId } },
    });

    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    // Run dynamic on-demand stream analysis
    let profile = null;
    try {
      profile = await this.codecService.getOrAnalyzeStream(
        ContentType.MOVIE,
        movie.id,
        movie.streamUrl,
        movie.providerId,
      );
    } catch (err) {
      this.logger.error(`Failed to retrieve/analyze stream profile: ${err.message}`);
    }

    const forceTranscode = transcode === 'audio' || transcode === 'video';
    const transcodeType = transcode === 'video' ? 'VIDEO' : 'AUDIO';
    const isDolby = this.isDolbyName(movie.name);

    // Direct playback vs transcoding logic
    // If a specific audio track or start time is requested, we MUST transcode/remux using FFmpeg.
    if (audioTrack !== undefined || start !== undefined || forceTranscode || (profile && profile.transcodingRequired && profile.transcodeType) || isDolby) {
      const type = forceTranscode ? transcodeType : ((profile && profile.transcodeType === 'VIDEO') ? 'VIDEO' : 'AUDIO');
      return this.handleTranscodeStream(movie.streamUrl, type, res, audioTrack, start, false, movieId, transcode);
    }

    // Proxy the stream directly while supporting Range requests
    this.logger.log(`No transcoding required for movie ${movieId}. Proxying directly from provider.`);
    
    try {
      const headers: any = {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      };
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await firstValueFrom(
        this.httpService.get(movie.streamUrl, {
          responseType: 'stream',
          decompress: false,
          headers,
          validateStatus: status => status < 400 || status === 403 || status === 404,
        })
      );

      // Copy essential headers back to the client
      const headersToCopy = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      headersToCopy.forEach(h => {
        if (response.headers[h]) {
          res.setHeader(h, response.headers[h]);
        }
      });
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.status(response.status);
      response.data.pipe(res);
    } catch (error) {
      this.logger.error(`Movie stream proxy failed: ${error.message}`);
      if (!res.headersSent) {
        res.status(502).send('Stream Unavailable');
      }
    }
  }

  async getEpisodeStreamInfo(episodeId: string, userId: string) {
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, season: { series: { provider: { userId } } } },
    });
    if (!episode) throw new NotFoundException('Episode not found');

    try {
      return await this.codecService.probeStream(episode.streamUrl);
    } catch (err) {
      return { allAudioStreams: [] };
    }
  }

  async proxyEpisodeStream(req: any, episodeId: string, userId: string, res: Response, audioTrack?: number, start?: number, transcode?: string) {
    this.logger.log(`Proxying Episode Stream: ${episodeId}, AudioTrack: ${audioTrack}, Start: ${start}, Transcode: ${transcode}`);

    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, season: { series: { provider: { userId } } } },
      include: { season: { include: { series: { include: { provider: true } } } } }
    });

    if (!episode) {
      throw new NotFoundException('Episode not found');
    }

    // Run dynamic on-demand stream analysis
    let profile = null;
    if (episode.season && episode.season.series) {
      try {
        profile = await this.codecService.getOrAnalyzeStream(
          ContentType.EPISODE,
          episode.id,
          episode.streamUrl,
          episode.season.series.providerId,
        );
      } catch (err) {
        this.logger.error(`Failed to retrieve/analyze stream profile: ${err.message}`);
      }
    }

    const forceTranscode = transcode === 'audio' || transcode === 'video';
    const transcodeType = transcode === 'video' ? 'VIDEO' : 'AUDIO';
    const isDolby = this.isDolbyName(episode.title || undefined) || (episode.season?.series && this.isDolbyName(episode.season.series.name));

    // Direct playback vs transcoding logic
    // If a specific audio track or start time is requested, we MUST transcode/remux using FFmpeg.
    if (audioTrack !== undefined || start !== undefined || forceTranscode || (profile && profile.transcodingRequired && profile.transcodeType) || isDolby) {
      const type = forceTranscode ? transcodeType : ((profile && profile.transcodeType === 'VIDEO') ? 'VIDEO' : 'AUDIO');
      return this.handleTranscodeStream(episode.streamUrl, type, res, audioTrack, start, false, episodeId, transcode);
    }

    // Proxy the stream directly while supporting Range requests
    this.logger.log(`No transcoding required for episode ${episodeId}. Proxying directly from provider.`);
    
    try {
      const headers: any = {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      };
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await firstValueFrom(
        this.httpService.get(episode.streamUrl, {
          responseType: 'stream',
          decompress: false,
          headers,
          validateStatus: status => status < 400 || status === 403 || status === 404,
        })
      );

      // Copy essential headers back to the client
      const headersToCopy = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      headersToCopy.forEach(h => {
        if (response.headers[h]) {
          res.setHeader(h, response.headers[h]);
        }
      });
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.status(response.status);
      response.data.pipe(res);
    } catch (error) {
      this.logger.error(`Episode stream proxy failed: ${error.message}`);
      if (!res.headersSent) {
        res.status(502).send('Stream Unavailable');
      }
    }
  }

  // --- DOWNLOAD PROXIES ---
  async validateDownloadLimitOnly(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.email === 'srk' || user.email === 'srk@ipgenz.com') {
      return;
    }

    if (user.isPremiumTrial) {
      const now = new Date();
      let shouldReset = true;
      if (user.lastDownloadAt) {
        const lastDownloadDate = new Date(user.lastDownloadAt);
        const isSameDay =
          now.getUTCFullYear() === lastDownloadDate.getUTCFullYear() &&
          now.getUTCMonth() === lastDownloadDate.getUTCMonth() &&
          now.getUTCDate() === lastDownloadDate.getUTCDate();

        if (isSameDay) {
          shouldReset = false;
        }
      }

      if (!shouldReset && user.downloadsToday >= 1) {
        throw new HttpException(
          'Premium trial accounts are limited to 1 download per day.',
          HttpStatus.FORBIDDEN
        );
      }
    }
  }

  private async checkAndIncrementDownloadLimit(userId: string) {
    const user: any = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.email === 'srk' || user.email === 'srk@ipgenz.com') {
      return;
    }

    if (user.isPremiumTrial) {
      const now = new Date();
      let shouldReset = true;
      if (user.lastDownloadAt) {
        const lastDownloadDate = new Date(user.lastDownloadAt);
        const isSameDay =
          now.getUTCFullYear() === lastDownloadDate.getUTCFullYear() &&
          now.getUTCMonth() === lastDownloadDate.getUTCMonth() &&
          now.getUTCDate() === lastDownloadDate.getUTCDate();

        if (isSameDay) {
          shouldReset = false;
        }
      }

      if (!shouldReset && user.downloadsToday >= 1) {
        throw new HttpException(
          'Premium trial accounts are limited to 1 download per day.',
          HttpStatus.FORBIDDEN
        );
      }

      // Update download metrics
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastDownloadAt: now,
          downloadsToday: shouldReset ? 1 : user.downloadsToday + 1,
        } as any,
      });
    }
  }

  async proxyDownloadMovie(movieId: string, userId: string, targetUserId: string, res: Response) {
    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, provider: { userId: targetUserId } },
    });
    if (!movie) throw new NotFoundException('Movie not found');
    
    await this.checkAndIncrementDownloadLimit(userId);

    // Instead of streaming and transcode, we just redirect or pipe with Content-Disposition
    // But since the PRD says "Downloaded files must be stored: downloads/{user_id}/", 
    // a real implementation would use ffmpeg to save to disk. 
    // For now, we will initiate a download attachment response by streaming it directly.
    const filename = `${movie.name.replace(/[^a-z0-9]/gi, '_')}.mp4`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    // We can simply pipe from httpService to bypass CORS and force download
    try {
      const response = await firstValueFrom(
        this.httpService.get(movie.streamUrl, {
          responseType: 'stream',
          decompress: false,
          headers: {
            'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
            'Accept-Encoding': 'identity',
          }
        })
      );
      response.data.pipe(res);
    } catch (e) {
      res.status(500).send('Failed to download movie');
    }
  }

  async proxyDownloadEpisode(episodeId: string, userId: string, targetUserId: string, res: Response) {
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, season: { series: { provider: { userId: targetUserId } } } },
      include: { season: { include: { series: true } } }
    });
    if (!episode) throw new NotFoundException('Episode not found');
    
    await this.checkAndIncrementDownloadLimit(userId);

    const filename = `${episode.season.series.name.replace(/[^a-z0-9]/gi, '_')}_S${episode.season.seasonNumber}_E${episode.episodeNumber}.mp4`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    try {
      const response = await firstValueFrom(
        this.httpService.get(episode.streamUrl, {
          responseType: 'stream',
          decompress: false,
          headers: {
            'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
            'Accept-Encoding': 'identity',
          }
        })
      );
      response.data.pipe(res);
    } catch (e) {
      res.status(500).send('Failed to download episode');
    }
  }
}
