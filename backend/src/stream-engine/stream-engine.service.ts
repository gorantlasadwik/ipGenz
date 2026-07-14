/**
 * Stream Engine Service — v7
 *
 * Manages the map of ChannelWorkers (one per active channel).
 * Handles viewer attachment and stream metadata retrieval.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FfprobeService, StreamProfile } from './ffprobe.service';
import { ChannelWorker } from './channel-worker';
import type { Request, Response } from 'express';

@Injectable()
export class StreamEngineService {
  private readonly logger = new Logger('StreamEngineService');
  private readonly workers = new Map<string, ChannelWorker>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ffprobe: FfprobeService,
  ) {}

  /**
   * Attaches a viewer to the ring buffer for a given channel.
   * Spawns a ChannelWorker if one doesn't exist yet.
   * Streams MPEG-TS data directly to the HTTP response.
   */
  async attachViewer(
    channelId: string,
    userId: string,
    res: Response,
    req: Request,
  ): Promise<void> {
    // 1. Look up channel in DB (verifies ownership)
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });

    if (!channel || !channel.streamUrl) {
      if (!res.headersSent) res.status(404).json({ error: 'Channel not found' });
      return;
    }

    // 2. Get or create the ChannelWorker
    const worker = this.getOrCreateWorker(channelId, channel.streamUrl);
    worker.incrementSubscribers();

    // 3. Set streaming response headers
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // 4. Subscribe to the ring buffer — 3s backfill for stream synchronization
    const unsubscribe = worker.ringBuffer.subscribe((chunk) => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(chunk);
      }
    }, 3000);

    this.logger.log(`[StreamEngine] Viewer attached to channel ${channelId}`);

    // 5. Cleanup when viewer disconnects
    req.on('close', () => {
      unsubscribe();
      worker.decrementSubscribers(() => {
        this.workers.delete(channelId);
        this.logger.log(`[StreamEngine] Worker for ${channelId} destroyed (no viewers).`);
      });
      this.logger.log(`[StreamEngine] Viewer disconnected from channel ${channelId}`);
    });
  }

  /**
   * Returns stream metadata (codec info, audio tracks) for the client
   * to determine its decode path before starting playback.
   */
  async getStreamInfo(channelId: string, userId: string): Promise<StreamProfile> {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });

    if (!channel || !channel.streamUrl) {
      return {
        videoCodec: 'h264',
        audioTracks: [{ index: 0, codec: 'aac', language: 'default' }],
        subtitleTracks: [],
        container: 'mpegts',
        scannedAt: Date.now(),
      };
    }

    return this.ffprobe.scanStream(channel.streamUrl);
  }

  /**
   * Returns health info for all active workers.
   */
  getWorkerHealth(): object[] {
    return Array.from(this.workers.values()).map(w => w.getHealth());
  }

  private getOrCreateWorker(channelId: string, streamUrl: string): ChannelWorker {
    const existing = this.workers.get(channelId);
    if (existing) return existing;

    const worker = new ChannelWorker({
      channelId,
      streamUrl,
      idleShutdownMs: 10_000,
    });
    worker.start();
    this.workers.set(channelId, worker);

    this.logger.log(`[StreamEngine] Created new ChannelWorker for ${channelId}`);
    return worker;
  }

  onModuleDestroy(): void {
    for (const worker of this.workers.values()) {
      worker.destroy();
    }
    this.workers.clear();
  }
}
