/**
 * ChannelWorker — Per-channel continuous live streaming engine.
 *
 * Architecture:
 *   Provider HTTP → Connection Loop → FFmpeg stdin
 *                                         ↓
 *                                   FFmpeg (-fflags +genpts, -c copy)
 *                                         ↓
 *                                   RingBuffer (10MB circular)
 *                                         ↓
 *                                  Browser subscribers
 *
 * Key design decisions:
 *   - FFmpeg is NEVER restarted between provider reconnects.
 *     One long-lived FFmpeg per channel.
 *     -fflags +genpts forces continuous timestamp regeneration across reconnects.
 *
 *   - Uses Axios (httpService) for HTTP requests — correctly follows redirects,
 *     handles CDN hops, and manages auth that raw http.get misses.
 *
 *   - Default mode: -c copy (no re-encode). If audio transcode needed: -c:a aac.
 *
 *   - Connection loop reconnects instantly on provider EOF.
 *     Browser never sees this reconnect.
 */

import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import { RingBuffer } from './ring-buffer';

const ffmpegStatic = require('ffmpeg-static');

export interface WorkerOptions {
  channelId: string;
  streamUrl: string;
  /** Selected audio track index (0-based). Default: not mapped (let FFmpeg auto-select). */
  audioTrackIndex?: number;
  /** Force audio transcode (e.g. AC3 → AAC). Default: false (copy). */
  transcodeAudio?: boolean;
  /** Ring buffer capacity in bytes. Default: 10MB */
  ringCapacityBytes?: number;
}

export class ChannelWorker {
  private readonly logger = new Logger('ChannelWorker');
  private readonly ring: RingBuffer;
  private ffmpegProcess: any = null;
  private ffmpegStdin: any = null;
  private destroyed = false;
  private reconnectCount = 0;
  private consecutiveErrors = 0;
  private lastBytesIn = 0;
  private totalBytesIn = 0;
  private running = false;
  private currentProviderStream: any = null;
  private statsInterval: NodeJS.Timeout | null = null;

  readonly channelId: string;

  constructor(
    private readonly opts: WorkerOptions,
    private readonly httpService: HttpService,
  ) {
    this.channelId = opts.channelId;
    this.ring = new RingBuffer(opts.ringCapacityBytes ?? 10 * 1024 * 1024);
  }

  /**
   * Start the worker. Spawns FFmpeg and begins the provider connection loop.
   */
  async start(): Promise<void> {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.logger.log(`[Worker:${this.channelId}] Starting.`);
    this.spawnFfmpeg();
    this.startConnectionLoop();
    this.startStatsLogger();
  }

  /** Add a browser subscriber. Returns a PassThrough that receives normalized TS. */
  subscribe(): PassThrough {
    return this.ring.addSubscriber();
  }

  /** Remove a browser subscriber. */
  unsubscribe(pt: PassThrough): void {
    this.ring.removeSubscriber(pt);
  }

  get subscriberCount(): number {
    return this.ring.subscriberCount;
  }

  get isRunning(): boolean {
    return this.running && !this.destroyed;
  }

  /**
   * Destroy the worker. Kills FFmpeg, clears ring buffer, removes all subscribers.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.logger.log(`[Worker:${this.channelId}] Destroying.`);

    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.currentProviderStream) {
      try { this.currentProviderStream.destroy(); } catch (_) {}
      this.currentProviderStream = null;
    }
    if (this.ffmpegProcess) {
      try { this.ffmpegStdin?.destroy(); } catch (_) {}
      try { this.ffmpegProcess.kill('SIGKILL'); } catch (_) {}
      this.ffmpegProcess = null;
    }
    this.ring.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Spawn a single long-lived FFmpeg process for the lifetime of this worker.
   * FFmpeg reads raw TS from stdin and writes normalized TS to stdout.
   *
   * Critical: We keep this process alive across ALL provider reconnects.
   * -fflags +genpts regenerates timestamps from scratch, absorbing all
   * provider-side PTS/DTS discontinuities. From the browser's view,
   * timestamps are always monotonically increasing.
   */
  private spawnFfmpeg(): void {
    if (this.destroyed) return;

    // Clear ring buffer on new FFmpeg spawn to prevent timestamp mixing/discontinuity
    this.ring.clear();

    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;
    const transcodeAudio = this.opts.transcodeAudio ?? false;
    const audioTrackIndex = this.opts.audioTrackIndex;

    const args: string[] = [
      // Input — handle all timestamp weirdness from provider
      '-fflags', '+genpts+discardcorrupt+igndts+nobuffer',
      '-analyzeduration', '500000',   // 0.5s analyze (fast start)
      '-probesize', '500000',          // 500KB probe (fast start)
      '-i', 'pipe:0',                  // read from stdin (continuously fed by connection loop)
    ];

    // Stream mapping — only map specific audio track if requested
    if (audioTrackIndex !== undefined) {
      args.push('-map', '0:v?', '-map', `0:a:${audioTrackIndex}?`);
    }
    // else: no -map → FFmpeg auto-selects best video + audio (safest default)

    // Video — NEVER re-encode
    args.push('-c:v', 'copy');

    // Audio — copy unless explicitly transcoding
    if (transcodeAudio) {
      args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000');
    } else {
      args.push('-c:a', 'copy');
    }

    // Muxer — continuous, flushed output
    args.push(
      '-avoid_negative_ts', 'make_zero',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-max_muxing_queue_size', '4096',
      '-flush_packets', '1',
      '-f', 'mpegts',
      'pipe:1',
    );

    this.logger.log(`[Worker:${this.channelId}] Spawning FFmpeg with args: ${args.join(' ')}`);

    const proc = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as any;

    this.ffmpegProcess = proc;
    this.ffmpegStdin = proc.stdin;

    // FFmpeg stdout → ring buffer (continuous normalized output to all browsers)
    proc.stdout.on('data', (chunk: Buffer) => {
      if (this.destroyed) return;
      this.ring.write(chunk);
    });

    // Log only significant FFmpeg messages
    proc.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (
        msg.includes('Error') ||
        msg.includes('error') ||
        msg.includes('Invalid') ||
        msg.includes('No such')
      ) {
        this.logger.warn(`[Worker:${this.channelId}][FFmpeg] ${msg}`);
      }
    });

    proc.on('error', (err: Error) => {
      this.logger.error(`[Worker:${this.channelId}][FFmpeg] Process error: ${err.message}`);
    });

    proc.on('close', (code: number) => {
      this.logger.log(`[Worker:${this.channelId}][FFmpeg] Exited with code ${code}`);
      this.ffmpegProcess = null;
      this.ffmpegStdin = null;

      // If not intentionally destroyed, respawn FFmpeg
      if (!this.destroyed) {
        this.logger.warn(`[Worker:${this.channelId}] FFmpeg exited unexpectedly — respawning in 300ms`);
        setTimeout(() => { if (!this.destroyed) this.spawnFfmpeg(); }, 300);
      }
    });

    this.logger.log(`[Worker:${this.channelId}] FFmpeg spawned (PID: ${proc.pid})`);
  }

  /**
   * Async connection loop — continuously fetches provider stream and pipes to FFmpeg stdin.
   * Uses Axios (httpService) so redirects, CDN hops, and auth are handled automatically.
   * Provider reconnects are completely transparent to the browser.
   */
  private async startConnectionLoop(): Promise<void> {
    while (!this.destroyed) {
      try {
        this.logger.log(
          `[Worker:${this.channelId}] Connecting to provider` +
          (this.reconnectCount > 0 ? ` (reconnect #${this.reconnectCount})` : '')
        );

        // Axios handles redirects, CDN hops, compression headers automatically
        const response = await firstValueFrom(
          this.httpService.get(this.opts.streamUrl, {
            responseType: 'stream',
            decompress: false,
            timeout: 10000,
            headers: {
              'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
              'Accept': '*/*',
              'Accept-Encoding': 'identity',
              'Connection': 'keep-alive',
            },
          })
        );

        const stream = response.data;
        this.currentProviderStream = stream;
        this.consecutiveErrors = 0;

        this.logger.log(
          `[Worker:${this.channelId}] Provider connected (HTTP ${response.status}). ` +
          `Feeding FFmpeg stdin.`
        );

        await new Promise<void>((resolve) => {
          // Feed provider stream → FFmpeg stdin
          stream.on('data', (chunk: Buffer) => {
            if (this.destroyed) {
              try { stream.destroy(); } catch (_) {}
              return;
            }
            this.totalBytesIn += chunk.length;

            if (this.ffmpegStdin && !this.ffmpegStdin.destroyed) {
              try {
                const ok = this.ffmpegStdin.write(chunk);
                if (!ok) {
                  // Backpressure — wait for FFmpeg to consume before reading more
                  stream.pause();
                  this.ffmpegStdin.once('drain', () => {
                    if (!this.destroyed) {
                      try { stream.resume(); } catch (_) {}
                    }
                  });
                }
              } catch (_) {}
            }
          });

          stream.on('end', () => {
            this.logger.log(
              `[Worker:${this.channelId}] Provider EOF after ${this.totalBytesIn - this.lastBytesIn} bytes. ` +
              `Reconnecting immediately.`
            );
            this.reconnectCount++;
            this.currentProviderStream = null;
            resolve();
          });

          stream.on('error', (err: Error) => {
            this.logger.warn(`[Worker:${this.channelId}] Provider stream error: ${err.message}`);
            this.currentProviderStream = null;
            resolve();
          });

          stream.on('close', () => {
            this.currentProviderStream = null;
            resolve();
          });
        });

        // Tiny yield between reconnects — lets event loop breathe
        if (!this.destroyed) {
          await new Promise(r => setTimeout(r, 50));
        }

      } catch (err: any) {
        this.consecutiveErrors++;
        const delay = Math.min(100 * Math.pow(2, this.consecutiveErrors - 1), 3000);
        this.logger.warn(
          `[Worker:${this.channelId}] Connection error #${this.consecutiveErrors}: ${err.message}. ` +
          `Retrying in ${delay}ms`
        );
        if (this.consecutiveErrors > 20) {
          this.logger.error(`[Worker:${this.channelId}] Too many consecutive errors — giving up.`);
          this.destroy();
          return;
        }
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  private startStatsLogger(): void {
    let lastTotal = 0;
    this.statsInterval = setInterval(() => {
      if (this.destroyed) return;
      const delta = this.totalBytesIn - lastTotal;
      lastTotal = this.totalBytesIn;
      const kbps = Math.round((delta * 8) / 1024);
      this.logger.log(
        `[Worker:${this.channelId}] ` +
        `Reconnects=${this.reconnectCount} ` +
        `Subscribers=${this.ring.subscriberCount} ` +
        `Bitrate=${kbps}kbps ` +
        `RingBytes=${this.ring.getBufferedBytes()}`
      );
    }, 5000);
  }
}
