import { Injectable, Logger, NotFoundException, HttpException, HttpStatus, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom } from 'rxjs';
import type { Response } from 'express';
import { CodecService } from './codec.service';
import { ContentType } from '@prisma/client';
import { spawn } from 'child_process';
import { PassThrough, Transform } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
const ffmpegStatic = require('ffmpeg-static');

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
  private hlsSessions = new Map<string, HlsSession>();
  private hlsCleanupInterval: any = null;

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
    this.hlsCleanupInterval = setInterval(() => this.cleanupExpiredHlsSessions(), 10000);
  }

  onModuleDestroy() {
    if (this.hlsCleanupInterval) {
      clearInterval(this.hlsCleanupInterval);
    }
    for (const session of this.hlsSessions.values()) {
      this.destroyHlsSession(session);
    }
    this.hlsSessions.clear();

    const mainHlsDir = path.join(process.cwd(), 'temp_hls');
    if (fs.existsSync(mainHlsDir)) {
      try {
        fs.rmSync(mainHlsDir, { recursive: true, force: true });
      } catch (e: any) {
        this.logger.error(`Failed to delete main HLS dir on destroy: ${e.message}`);
      }
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
    args.push('-fflags', '+genpts+discardcorrupt+igndts');
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

    if (transcodeType && !useDynamicRestart) {
      this.logger.log(`[FFMPEG_SINGLE_SPAWN][Channel:${channelId}] Spawning single long-lived FFmpeg instance`);
      const args: string[] = [
        '-debug_ts',
        '-fflags', '+genpts+discardcorrupt+igndts',
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
      args.push('-f', 'mpegts', 'pipe:1');

      singleFfmpegProcess = spawn(ffmpegPath, args) as any;
      singleStitcher = new PassThrough();
      singleStitcher.pipe(singleFfmpegProcess.stdin);
      singleFfmpegProcess.stdout.pipe(sink, { end: false });

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

    while (!isClientDisconnected() && !sink.writableEnded && !sink.destroyed) {
      if (singleFfmpegProcess && singleFfmpegProcess.killed) {
        this.logger.warn(`[StitcherLoop][Channel:${channelId}] Single FFmpeg process died, stopping loop.`);
        break;
      }

      let ffmpegProcess: any = null;
      let tsDiagnostics: TsDiagnosticsTransform | null = null;

      try {
        this.logger.log(`[PROVIDER_CONNECT][Channel:${channelId}] Connecting to: ${streamUrl}`);
        const response = await firstValueFrom(
          this.httpService.get(streamUrl, {
            responseType: 'stream',
            decompress: false,
            headers: requestHeaders,
          }).pipe(catchError(err => { throw err; }))
        );

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
              '-fflags', '+genpts+discardcorrupt+igndts',
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

          if (outputNode) {
            outputNode.pipe(tsDiagnostics, { end: false });
            tsDiagnostics.pipe(sink, { end: false });
          }

          const cleanup = () => {
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

          response.data.on('data', (chunk: Buffer) => {
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

  async proxyLiveStream(channelId: string, audioTrack: number | undefined, userId: string, res: Response, transcode?: string) {
    this.logger.log(`Proxying Live Stream for channel: ${channelId}, audioTrack: ${audioTrack}, Transcode: ${transcode}`);

    // Look up the real stream URL from the database and verify ownership
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
      include: { provider: true },
    });

    // If channel not found in DB, fall back to test stream for demo
    const streamUrl = channel?.streamUrl || 'http://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

    if (!channel) {
      this.logger.warn(`Channel ${channelId} not found in DB, using test stream`);
    }

    // Run dynamic on-demand stream analysis if channel is real
    let profile = null;
    if (channel) {
      try {
        profile = await this.codecService.getOrAnalyzeStream(
          ContentType.CHANNEL,
          channel.id,
          streamUrl,
          channel.providerId,
        );
      } catch (err) {
        this.logger.error(`Failed to retrieve/analyze stream profile: ${err.message}`);
      }
    }

    const forceTranscode = transcode === 'audio' || transcode === 'video';
    const transcodeType = transcode === 'video' ? 'VIDEO' : 'AUDIO';

    // If client explicitly requested transcoding (detected unsupported codec client-side).
    // isLive=true → segment stitcher keeps FFmpeg stdin open forever.
    if (forceTranscode) {
      return this.handleTranscodeStream(streamUrl, transcodeType as any, res, undefined, undefined, true, channelId, transcode);
    }

    // If a specific audio track is requested, transcode with stitcher (live).
    if (audioTrack !== undefined) {
      const type = (profile && profile.transcodeType === 'VIDEO') ? 'VIDEO' : 'AUDIO';
      return this.handleTranscodeStream(streamUrl, type as any, res, audioTrack, undefined, true, channelId, transcode);
    }

    // If profile (from background ffprobe cache) confirms transcoding is needed
    if (profile && profile.transcodingRequired && profile.transcodeType) {
      return this.handleTranscodeStream(streamUrl, profile.transcodeType as any, res, undefined, undefined, true, channelId, transcode || 'audio');
    }

    // ── DIRECT PROXY: segment stitcher ────────────────────────────────────────
    // Instead of piping a single 33-second response and letting it close, we
    // keep the client HTTP response open and continuously fetch the next segment,
    // writing each one in with end:false.  The browser never sees EOF so
    // mpegts.js sets duration = Infinity and shows a proper LIVE stream.
    res.set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    });

    const stitcher = new PassThrough();
    let clientDisconnected = false;
    res.on('close', () => { clientDisconnected = true; });
    stitcher.pipe(res);

    this.pipeSegmentsInfinitely(
      channelId,
      streamUrl,
      { 'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16', 'Accept': '*/*', 'Accept-Encoding': 'identity' },
      stitcher,
      () => clientDisconnected,
    ).catch(e => {
      this.logger.error(`[SegmentStitcher] Direct proxy error: ${e.message}`);
      if (!res.writableEnded) res.end();
    });
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

  private destroyHlsSession(session: HlsSession) {
    this.logger.log(`Cleaning up HLS session for channel ${session.channelId}`);
    session.isClientDisconnected = true;
    try { session.stitcher.destroy(); } catch (_) {}
    try { session.ffmpegProcess.stdin.destroy(); } catch (_) {}
    try { session.ffmpegProcess.kill('SIGKILL'); } catch (_) {}
    
    setTimeout(() => {
      if (fs.existsSync(session.tempDir)) {
        try {
          fs.rmSync(session.tempDir, { recursive: true, force: true });
        } catch (e: any) {
          this.logger.warn(`Failed to clean directory ${session.tempDir}: ${e.message}`);
        }
      }
    }, 1000);
  }

  private cleanupExpiredHlsSessions() {
    const now = Date.now();
    const expiryThreshold = 30000; // 30 seconds idle
    for (const [channelId, session] of this.hlsSessions.entries()) {
      if (now - session.lastActive > expiryThreshold) {
        this.destroyHlsSession(session);
        this.hlsSessions.delete(channelId);
      }
    }
  }

  async getHlsPlaylist(channelId: string, userId: string, token: string, res: Response) {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });
    if (!channel || !channel.streamUrl) {
      throw new NotFoundException('Channel not found');
    }

    const streamUrl = channel.streamUrl;
    let session = this.hlsSessions.get(channelId);

    if (!session) {
      this.logger.log(`Starting dynamic HLS transcode for iOS on channel ${channelId}`);
      const tempDir = path.join(process.cwd(), 'temp_hls', channelId);
      fs.mkdirSync(tempDir, { recursive: true });

      const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;
      
      const args = [
        '-debug_ts',
        '-fflags', '+genpts+discardcorrupt+igndts',
        '-i', 'pipe:0',
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
        '-avoid_negative_ts', 'make_zero',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments',
        '-hls_segment_filename', path.join(tempDir, 'seg_%d.ts'),
        path.join(tempDir, 'playlist.m3u8')
      ];

      const ffmpegProcess = spawn(ffmpegPath, args) as any;
      const stitcher = new PassThrough();
      stitcher.pipe(ffmpegProcess.stdin);

      const activeSession: HlsSession = {
        channelId,
        ffmpegProcess,
        stitcher,
        lastActive: Date.now(),
        tempDir,
        isClientDisconnected: false,
      };

      session = activeSession;
      this.hlsSessions.set(channelId, session);

      const streamHeaders = {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      };

      this.pipeSegmentsInfinitely(channelId, streamUrl, streamHeaders, stitcher, () => activeSession.isClientDisconnected)
        .catch(e => {
          this.logger.error(`[HlsStitcher] Loop crashed: ${e.message}`);
          this.destroyHlsSession(activeSession);
          this.hlsSessions.delete(channelId);
        });

      ffmpegProcess.stderr.on('data', (data: any) => {
        const str = data.toString().trim();
        if (str.toLowerCase().includes('warning') || str.toLowerCase().includes('error')) {
          this.logger.warn(`FFmpeg HLS Stderr: ${str}`);
        }
      });

      ffmpegProcess.on('close', (code: any) => {
        this.logger.log(`FFmpeg HLS exited with code ${code}`);
        this.destroyHlsSession(activeSession);
        this.hlsSessions.delete(channelId);
      });
    }

    session.lastActive = Date.now();

    const playlistPath = path.join(session.tempDir, 'playlist.m3u8');
    let attempts = 0;
    while (!fs.existsSync(playlistPath) && attempts < 100) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!fs.existsSync(playlistPath)) {
      this.logger.error(`HLS playlist generation timed out for channel ${channelId}`);
      if (!res.headersSent) res.status(504).send('Transcoding Timeout');
      return;
    }

    try {
      let content = fs.readFileSync(playlistPath, 'utf8');
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
      this.logger.error(`Error reading HLS playlist: ${e.message}`);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  }

  async getHlsSegment(channelId: string, segmentName: string, res: Response) {
    const session = this.hlsSessions.get(channelId);
    if (!session) {
      if (!res.headersSent) res.status(404).send('Session not found');
      return;
    }

    session.lastActive = Date.now();

    const segmentPath = path.join(session.tempDir, segmentName);
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
    stream.pipe(res);
  }
}
