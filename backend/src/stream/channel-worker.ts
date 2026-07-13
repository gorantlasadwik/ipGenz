import { Logger } from '@nestjs/common';
import { HlsSegmenter } from './hls-segmenter';

export interface WorkerOptions {
  channelId: string;
  streamUrl: string;
  tempDir: string;
}

export class ChannelWorker {
  private readonly logger = new Logger(ChannelWorker.name);
  private readonly segmenter: HlsSegmenter;
  private destroyed = false;
  private running = false;
  private statsInterval: NodeJS.Timeout | null = null;
  private subscribers = 0;

  readonly channelId: string;

  constructor(
    private readonly opts: WorkerOptions,
  ) {
    this.channelId = opts.channelId;
    this.segmenter = new HlsSegmenter(opts.channelId, opts.tempDir, opts.streamUrl);
  }

  /**
   * Start the worker. Starts HLS segmenter.
   */
  async start(): Promise<void> {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.logger.log(`[Worker:${this.channelId}] Starting Live HLS Worker.`);
    this.segmenter.start();
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
   * Destroy the worker. Kills segmenter.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.logger.log(`[Worker:${this.channelId}] Destroying Live HLS Worker.`);

    if (this.statsInterval) clearInterval(this.statsInterval);
    this.segmenter.destroy();
  }

  private startStatsLogger(): void {
    this.statsInterval = setInterval(() => {
      if (this.destroyed) return;
      this.logger.log(
        `[Worker:${this.channelId}] Active Subscribers=${this.subscribers}`
      );
    }, 5000);
  }
}
