/**
 * Channel Worker — v7
 *
 * Manages one channel's complete lifecycle:
 * - Protocol detection
 * - FFmpeg ingest (always passthrough -c:v copy -c:a copy)
 * - Timestamp Continuity Engine (keeps PTS/DTS monotonic across reconnects)
 * - Ring Buffer (monotonic logical positions, loop-to-start defect closed)
 * - Auto-shutdown after 10s with zero subscribers
 *
 * One ChannelWorker per actively-viewed channel.
 * Never one per viewer — N viewers share one worker.
 */

import { Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { RingBuffer } from './ring-buffer';
import { TimestampContinuityEngine } from './timestamp-continuity';
import { detectProtocol, getFFmpegInputFlags, ProtocolType } from './protocol-detector';

export interface ChannelWorkerOptions {
  channelId: string;
  streamUrl: string;
  idleShutdownMs?: number;
}

export class ChannelWorker {
  private readonly logger = new Logger('ChannelWorker');

  readonly channelId: string;
  private readonly streamUrl: string;
  private readonly idleShutdownMs: number;

  readonly ringBuffer: RingBuffer;
  private readonly tce: TimestampContinuityEngine;

  private ffmpeg: ChildProcess | null = null;
  private running = false;
  private subscriberCount = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private totalReconnects = 0;
  private startedAt: number = 0;

  private onDestroyCallback?: () => void;

  constructor(opts: ChannelWorkerOptions) {
    this.channelId = opts.channelId;
    this.streamUrl = opts.streamUrl;
    this.idleShutdownMs = opts.idleShutdownMs ?? 10_000;
    this.ringBuffer = new RingBuffer(45_000);
    this.tce = new TimestampContinuityEngine();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    this.spawnFFmpeg();
  }

  private spawnFFmpeg(): void {
    if (!this.running) return;

    const protocol = detectProtocol(this.streamUrl);
    const inputFlags = getFFmpegInputFlags(protocol);

    this.logger.log(
      `[Worker:${this.channelId}] Spawning FFmpeg (reconnect #${this.totalReconnects}, protocol=${protocol})`
    );

    const args = [
      ...inputFlags,
      '-user_agent', 'VLC/3.0.16',
      '-i', this.streamUrl,
      '-map', '0:v?',
      '-map', '0:a?',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-max_muxing_queue_size', '4096',
      '-f', 'mpegts',
      'pipe:1',
    ];

    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.ffmpeg = proc;

    proc.stdout.on('data', (chunk: Buffer) => {
      // Run through Timestamp Continuity Engine before writing to ring buffer
      const adjusted = this.tce.process(chunk);
      if (adjusted.length > 0) {
        this.ringBuffer.write(adjusted);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      // Log only meaningful warnings, not the flood of progress lines
      if (msg.includes('Error') || msg.includes('error') || msg.includes('reconnect') || msg.includes('Non-monotonic')) {
        this.logger.warn(`[Worker:${this.channelId}] FFmpeg: ${msg.trim().slice(0, 200)}`);
      }
    });

    proc.on('close', (code, signal) => {
      if (!this.running) {
        this.logger.log(`[Worker:${this.channelId}] FFmpeg closed (shutting down).`);
        return;
      }

      this.totalReconnects++;
      this.logger.log(
        `[Worker:${this.channelId}] FFmpeg exited (code=${code}, signal=${signal}). Reconnect #${this.totalReconnects} in 1s.`
      );

      // Notify the TCE that a new session is about to begin
      this.tce.onRespawn();

      // Schedule restart
      this.restartTimer = setTimeout(() => {
        if (this.running) {
          this.spawnFFmpeg();
        }
      }, 1000);
    });

    proc.on('error', (err) => {
      this.logger.error(`[Worker:${this.channelId}] FFmpeg process error: ${err.message}`);
    });
  }

  incrementSubscribers(): void {
    this.subscriberCount++;
    // Cancel any pending idle shutdown
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.logger.log(`[Worker:${this.channelId}] Subscriber joined (total: ${this.subscriberCount})`);
  }

  decrementSubscribers(onDestroyed?: () => void): void {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);
    this.logger.log(`[Worker:${this.channelId}] Subscriber left (remaining: ${this.subscriberCount})`);

    if (this.subscriberCount === 0) {
      this.logger.log(
        `[Worker:${this.channelId}] Zero subscribers. Scheduling idle shutdown in ${this.idleShutdownMs}ms.`
      );
      this.onDestroyCallback = onDestroyed;
      this.idleTimer = setTimeout(() => {
        this.destroy();
        if (this.onDestroyCallback) this.onDestroyCallback();
      }, this.idleShutdownMs);
    }
  }

  destroy(): void {
    this.running = false;

    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }

    if (this.ffmpeg) {
      try { this.ffmpeg.kill('SIGKILL'); } catch {}
      this.ffmpeg = null;
    }

    this.ringBuffer.destroy();
    this.tce.reset();

    this.logger.log(`[Worker:${this.channelId}] Destroyed after ${Math.round((Date.now() - this.startedAt) / 1000)}s, ${this.totalReconnects} reconnects.`);
  }

  getHealth() {
    return {
      channelId: this.channelId,
      running: this.running,
      subscriberCount: this.subscriberCount,
      totalReconnects: this.totalReconnects,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      buffer: this.ringBuffer.getStats(),
      tce: this.tce.getStats(),
    };
  }
}
