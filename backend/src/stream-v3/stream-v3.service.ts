import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelWorker } from './channel-worker';
import type { Response } from 'express';

@Injectable()
export class StreamV3Service implements OnModuleDestroy {
  private readonly logger = new Logger(StreamV3Service.name);
  private readonly workers = new Map<string, ChannelWorker>();
  private readonly viewerOffsets = new Map<string, { lastSequence: number; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.logger.log('Cleaning up StreamV3 workers...');
    for (const [id, worker] of this.workers) {
      worker.destroy();
    }
    this.workers.clear();
    this.viewerOffsets.clear();
  }

  /**
   * Get or create a ChannelWorker for Player 3 (100% passthrough).
   */
  async getOrCreateWorker(channelId: string, streamUrl: string): Promise<ChannelWorker> {
    let worker = this.workers.get(channelId);
    if (!worker || !worker.isRunning) {
      worker = new ChannelWorker({ channelId, streamUrl });
      worker.start();
      this.workers.set(channelId, worker);
    }
    return worker;
  }

  /**
   * Attaches a viewer connection directly to the RingBuffer (0% CPU).
   * Supports offset tracking per viewerId to eliminate loop-to-start bugs.
   */
  async attachViewer(
    channelId: string,
    userId: string,
    res: Response,
    req: any,
    options: { viewerId?: string },
  ) {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });
    if (!channel || !channel.streamUrl) {
      if (!res.headersSent) res.status(404).send('Channel not found');
      return;
    }

    const worker = await this.getOrCreateWorker(channelId, channel.streamUrl);
    worker.incrementSubscribers();

    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Connection', 'keep-alive');

    const now = Date.now();
    // Clean expired viewer offsets
    for (const [key, val] of this.viewerOffsets.entries()) {
      if (val.expiresAt < now) {
        this.viewerOffsets.delete(key);
      }
    }

    const viewerKey = `${channelId}:${options.viewerId}`;
    let startFrom: number | { fromSequence: number } = 20000; // default 20s backfill
    if (options.viewerId) {
      const saved = this.viewerOffsets.get(viewerKey);
      if (saved && saved.expiresAt >= now) {
        this.logger.log(`[StreamV3Service][Channel:${channelId}] Resuming viewer ${options.viewerId} from sequence ${saved.lastSequence}`);
        startFrom = { fromSequence: saved.lastSequence };
      } else {
        this.logger.log(`[StreamV3Service][Channel:${channelId}] New connection for viewer ${options.viewerId}. Attaching with 3s backfill.`);
        startFrom = 3000; // 3 seconds backfill to parse codec info
      }
    }

    let unsubscribe: (() => void) | null = null;

    req.on('close', () => {
      this.logger.log(`[StreamV3Service][Channel:${channelId}] Client connection closed. Cleaning up subscriber.`);
      if (unsubscribe) unsubscribe();
      worker.decrementSubscribers(() => {
        this.workers.delete(channelId);
      });
    });

    this.logger.log(`[StreamV3Service][Channel:${channelId}] Piping RingBuffer directly to client (0% CPU)`);
    
    unsubscribe = worker.ringBuffer.subscribe((chunk, seq) => {
      if (!res.writableEnded && !res.destroyed) {
        if (options.viewerId) {
          this.viewerOffsets.set(viewerKey, {
            lastSequence: seq,
            expiresAt: Date.now() + 15000,
          });
        }
        res.write(chunk);
      }
    }, startFrom);
  }

  /**
   * Pre-warms the worker and retrieves active audio tracks.
   */
  async getLiveStreamInfo(channelId: string, userId: string): Promise<any> {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });
    if (!channel || !channel.streamUrl) {
      throw new NotFoundException('Channel not found');
    }

    const worker = await this.getOrCreateWorker(channelId, channel.streamUrl);

    // Wait up to 3 seconds for the PMT parser to find tracks
    for (let i = 0; i < 15; i++) {
      if (worker.tracks.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return {
      allAudioStreams: worker.tracks.map((t) => ({
        id: t.pid,
        codec: t.codec,
        channels: 2,
        language: t.lang,
      })),
    };
  }
}
