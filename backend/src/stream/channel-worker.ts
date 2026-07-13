/**
 * ChannelWorker — Per-channel continuous live streaming engine.
 *
 * Architecture:
 *   Provider HTTP → Connection Loop → FFmpeg stdin
 *                                         ↓
 *                                   FFmpeg (normalizes timestamps)
 *                                         ↓
 *                                   RingBuffer (10MB circular)
 *                                         ↓
 *                                  Browser subscribers
 *
 * Key design decisions:
 *   - FFmpeg is NEVER restarted between provider reconnects.
 *     We keep one long-lived FFmpeg process per channel.
 *     Provider data continuously feeds FFmpeg stdin.
 *     -fflags +genpts forces continuous timestamp regeneration
 *     regardless of what the provider sends — fixing all discontinuities.
 *
 *   - The provider connection loop reconnects instantly on EOF.
 *     The browser never sees this reconnect.
 *
 *   - Audio is handled per-PID. Only the selected audio track is
 *     mapped and transcoded (if needed). Video is always -c:v copy.
 */

import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import * as http from 'http';
import * as https from 'https';
import { RingBuffer } from './ring-buffer';

const ffmpegStatic = require('ffmpeg-static');

const keepAliveHttpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 5 });
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 5 });

export interface WorkerOptions {
  channelId: string;
  streamUrl: string;
  /** Selected audio track index (0-based). Default: 0 */
  audioTrackIndex?: number;
  /** Force audio transcode (e.g. AC3 → AAC). Default: auto-detect */
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
  private currentProviderStream: http.IncomingMessage | null = null;
  private statsInterval: NodeJS.Timeout | null = null;

  readonly channelId: string;

  constructor(private readonly opts: WorkerOptions) {
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
   */
  private spawnFfmpeg(): void {
    if (this.destroyed) return;

    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;
    const audioTrackIndex = this.opts.audioTrackIndex ?? 0;
    const transcodeAudio = this.opts.transcodeAudio ?? true; // default: transcode for compatibility

    const args: string[] = [
      // Input flags — handle all timestamp weirdness from provider
      '-fflags', '+genpts+discardcorrupt+igndts+nobuffer',
      '-analyzeduration', '1000000',   // 1s analyze (fast start)
      '-probesize', '1000000',          // 1MB probe
      '-i', 'pipe:0',                   // read from stdin

      // Map only the streams we need
      '-map', '0:v:0?',                 // first video (optional — some channels audio-only)
      '-map', `0:a:${audioTrackIndex}?`, // selected audio track only

      // Video — NEVER re-encode
      '-c:v', 'copy',

      // Audio — transcode only if needed
      ...(transcodeAudio
        ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000']
        : ['-c:a', 'copy']),

      // Muxer — keep timestamps continuous and clean
      '-avoid_negative_ts', 'make_zero',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-max_muxing_queue_size', '4096',
      '-flush_packets', '1',

      // Output
      '-f', 'mpegts',
      'pipe:1',
    ];

    this.logger.log(`[Worker:${this.channelId}] Spawning FFmpeg: ffmpeg ${args.join(' ')}`);

    const proc = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as any;

    this.ffmpegProcess = proc;
    this.ffmpegStdin = proc.stdin;

    // FFmpeg stdout → ring buffer (continuous normalized output)
    proc.stdout.on('data', (chunk: Buffer) => {
      if (this.destroyed) return;
      this.ring.write(chunk);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      // Only log warnings and errors to avoid noise
      if (msg.includes('Error') || msg.includes('error') || msg.includes('warning')) {
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
        this.logger.warn(`[Worker:${this.channelId}] FFmpeg exited unexpectedly — respawning in 500ms`);
        setTimeout(() => { if (!this.destroyed) this.spawnFfmpeg(); }, 500);
      }
    });

    this.logger.log(`[Worker:${this.channelId}] FFmpeg spawned (PID: ${proc.pid})`);
  }

  /**
   * Async connection loop — continuously fetches provider stream and pipes to FFmpeg stdin.
   * Provider reconnects are transparent to the browser.
   */
  private async startConnectionLoop(): Promise<void> {
    while (!this.destroyed) {
      try {
        this.logger.log(`[Worker:${this.channelId}] Connecting to provider (reconnect #${this.reconnectCount})`);

        const stream = await this.fetchProviderStream();
        this.currentProviderStream = stream;
        this.consecutiveErrors = 0;

        this.logger.log(`[Worker:${this.channelId}] Provider connected.`);

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
                if (!this.ffmpegStdin.write(chunk)) {
                  // Backpressure — wait for drain
                  stream.pause();
                  this.ffmpegStdin.once('drain', () => { try { stream.resume(); } catch (_) {} });
                }
              } catch (_) {}
            }
          });

          stream.on('end', () => {
            this.logger.log(`[Worker:${this.channelId}] Provider EOF. Will reconnect immediately.`);
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

        // Small yield between reconnects — lets the event loop breathe
        if (!this.destroyed) {
          await new Promise(r => setTimeout(r, 50));
        }

      } catch (err: any) {
        this.consecutiveErrors++;
        const delay = Math.min(100 * Math.pow(2, this.consecutiveErrors - 1), 2000);
        this.logger.warn(
          `[Worker:${this.channelId}] Connection error #${this.consecutiveErrors}: ${err.message}. ` +
          `Retrying in ${delay}ms`
        );
        if (this.consecutiveErrors > 20) {
          this.logger.error(`[Worker:${this.channelId}] Too many errors — giving up.`);
          this.destroy();
          return;
        }
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  /**
   * Opens an HTTP/HTTPS connection to the provider and returns the response stream.
   */
  private async fetchProviderStream(): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.opts.streamUrl);
      const isHttps = url.protocol === 'https:';
      const agent = isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent;
      const lib = isHttps ? https : http;

      const req = lib.get(
        this.opts.streamUrl,
        {
          agent,
          headers: {
            'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Provider returned HTTP ${res.statusCode}`));
            res.destroy();
            return;
          }
          resolve(res);
        }
      );

      req.on('error', reject);
      req.setTimeout(8000, () => {
        req.destroy(new Error('Provider connection timeout'));
      });
    });
  }

  private startStatsLogger(): void {
    this.statsInterval = setInterval(() => {
      if (this.destroyed) return;
      const delta = this.totalBytesIn - this.lastBytesIn;
      this.lastBytesIn = this.totalBytesIn;
      const kbps = Math.round((delta * 8) / 1024);
      this.logger.log(
        `[Worker:${this.channelId}] Reconnects=${this.reconnectCount} ` +
        `Subscribers=${this.ring.subscriberCount} ` +
        `Bitrate=${kbps}kbps ` +
        `BufferBytes=${this.ring.getBufferedBytes()}`
      );
    }, 5000);
  }
}
