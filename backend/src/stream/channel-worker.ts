import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { HlsSegmenter } from './hls-segmenter';
import * as http from 'http';

export interface WorkerOptions {
  channelId: string;
  streamUrl: string;
  tempDir: string;
}

export class ChannelWorker {
  private readonly logger = new Logger(ChannelWorker.name);
  private readonly segmenter: HlsSegmenter;
  private destroyed = false;
  private reconnectCount = 0;
  private consecutiveErrors = 0;
  private lastBytesIn = 0;
  private totalBytesIn = 0;
  private running = false;
  private currentProviderStream: http.IncomingMessage | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private subscribers = 0;

  readonly channelId: string;

  constructor(
    private readonly opts: WorkerOptions,
    private readonly httpService: HttpService,
  ) {
    this.channelId = opts.channelId;
    this.segmenter = new HlsSegmenter(opts.channelId, opts.tempDir);
  }

  /**
   * Start the worker. Starts HLS segmenter and begins the connection loop.
   */
  async start(): Promise<void> {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.logger.log(`[Worker:${this.channelId}] Starting Live HLS Worker.`);
    this.segmenter.start();
    this.startConnectionLoop();
    this.startStatsLogger();
  }

  /** Increment subscriber count */
  incrementSubscribers(): void {
    this.subscribers++;
    this.logger.log(`[Worker:${this.channelId}] Subscriber joined. Total active: ${this.subscribers}`);
  }

  /** Decrement subscriber count */
  decrementSubscribers(): void {
    this.subscribers = Math.max(0, this.subscribers - 1);
    this.logger.log(`[Worker:${this.channelId}] Subscriber left. Total active: ${this.subscribers}`);
  }

  get subscriberCount(): number {
    return this.subscribers;
  }

  get isRunning(): boolean {
    return this.running && !this.destroyed;
  }

  /**
   * Destroy the worker. Kills segmenter, stops provider loop.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.logger.log(`[Worker:${this.channelId}] Destroying Live HLS Worker.`);

    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.currentProviderStream) {
      try { this.currentProviderStream.destroy(); } catch (_) {}
      this.currentProviderStream = null;
    }
    this.segmenter.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Async connection loop — fetches provider stream and feeds it into the segmenter.
   * On EOF/disconnect, reconnects instantly. FFmpeg stdin remains open.
   */
  private async startConnectionLoop(): Promise<void> {
    while (!this.destroyed) {
      try {
        this.logger.log(
          `[Worker:${this.channelId}] Connecting to provider` +
          (this.reconnectCount > 0 ? ` (reconnect #${this.reconnectCount})` : '')
        );

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

        this.logger.log(`[Worker:${this.channelId}] Provider connected (HTTP ${response.status}). Piping to HlsSegmenter.`);

        await new Promise<void>((resolve) => {
          stream.on('data', (chunk: Buffer) => {
            if (this.destroyed) {
              try { stream.destroy(); } catch (_) {}
              return;
            }
            this.totalBytesIn += chunk.length;

            const ok = this.segmenter.write(chunk);
            if (!ok) {
              // Backpressure support
              stream.pause();
              this.segmenter.onDrain(() => {
                if (!this.destroyed) {
                  try { stream.resume(); } catch (_) {}
                }
              });
            }
          });

          stream.on('end', () => {
            this.logger.log(`[Worker:${this.channelId}] Provider EOF. Reconnecting...`);
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
          this.logger.error(`[Worker:${this.channelId}] Too many consecutive errors — stopping worker.`);
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
        `Subscribers=${this.subscribers} ` +
        `Bitrate=${kbps}kbps`
      );
    }, 5000);
  }
}
