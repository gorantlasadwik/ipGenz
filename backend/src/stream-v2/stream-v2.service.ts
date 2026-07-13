import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelWorker } from './channel-worker';
import type { Response, Request } from 'express';
import { spawn } from 'child_process';

const ffmpegStatic = require('ffmpeg-static');

@Injectable()
export class StreamV2Service implements OnModuleDestroy {
  private readonly logger = new Logger(StreamV2Service.name);
  private readonly workers = new Map<string, ChannelWorker>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.logger.log('Cleaning up StreamV2 workers...');
    for (const [id, worker] of this.workers) {
      worker.destroy();
    }
    this.workers.clear();
  }

  /**
   * Get an existing worker or create and start a new one for the given channel.
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
   * Streams a live channel to a viewer.
   * If client requests specific audioTrack or transcode=audio, we run a lightweight FFmpeg remuxer/transcoder
   * for that client's connection, reading from the RingBuffer.
   * Otherwise, we pipe the RingBuffer directly to the client with 0% CPU overhead.
   */
  async attachViewer(
    channelId: string,
    userId: string,
    res: Response,
    req: any,
    options: { audioTrack?: string; transcode?: string },
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

    const audioTrackNum = options.audioTrack !== undefined && options.audioTrack !== '' ? parseInt(options.audioTrack, 10) : undefined;
    const isTranscodeRequired = options.transcode === 'audio';

    let unsubscribe: (() => void) | null = null;
    let transcodeProcess: any = null;

    req.on('close', () => {
      this.logger.log(`[StreamV2Service][Channel:${channelId}] Client connection closed. cleaning up subscriber.`);
      if (unsubscribe) unsubscribe();
      if (transcodeProcess) {
        try {
          transcodeProcess.kill('SIGKILL');
        } catch (_) {}
      }
      worker.decrementSubscribers(() => {
        this.workers.delete(channelId);
      });
    });

    if (audioTrackNum !== undefined || isTranscodeRequired) {
      // Viewer needs track mapping or transcoding. Run a lightweight client-specific FFmpeg process.
      this.logger.log(
        `[StreamV2Service][Channel:${channelId}] Spawning client-specific remuxer. Audio Track: ${audioTrackNum}, Transcode Audio: ${isTranscodeRequired}`,
      );

      const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;
      const args: string[] = [
        '-fflags', '+genpts+discardcorrupt+igndts',
        '-f', 'mpegts',
        '-i', 'pipe:0', // read from stdin
        '-map', '0:v:0',
      ];

      if (audioTrackNum !== undefined) {
        // Map specific audio track PID (or index if PID isn't available)
        args.push('-map', `0:a:${audioTrackNum}`);
      } else {
        args.push('-map', '0:a:0?'); // fallback optional first audio stream
      }

      args.push('-c:v', 'copy');

      if (isTranscodeRequired) {
        args.push(
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ac', '2',
          '-ar', '48000',
        );
      } else {
        args.push('-c:a', 'copy');
      }

      args.push(
        '-avoid_negative_ts', 'make_zero',
        '-max_muxing_queue_size', '4096',
        '-f', 'mpegts',
        'pipe:1', // write to stdout
      );

      try {
        transcodeProcess = spawn(ffmpegPath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        transcodeProcess.stdout.pipe(res);

        transcodeProcess.stderr.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg.includes('Error') || msg.includes('error')) {
            this.logger.warn(`[ClientFFmpeg:${channelId}] ${msg}`);
          }
        });

        transcodeProcess.on('close', (code) => {
          this.logger.log(`[StreamV2Service][Channel:${channelId}] Client remuxer closed with code ${code}`);
          if (!res.writableEnded) res.end();
        });

        // Pipe from RingBuffer into the FFmpeg stdin
        unsubscribe = worker.ringBuffer.subscribe((chunk) => {
          if (transcodeProcess.stdin && transcodeProcess.stdin.writable) {
            transcodeProcess.stdin.write(chunk);
          }
        }, 20000);

      } catch (err: any) {
        this.logger.error(`[StreamV2Service][Channel:${channelId}] Failed to spawn client remuxer: ${err.message}`);
        if (!res.headersSent) res.status(500).send('Streaming error');
      }
    } else {
      // Direct stream with 0% CPU overhead
      this.logger.log(`[StreamV2Service][Channel:${channelId}] Piping RingBuffer directly to client (0% CPU)`);
      
      unsubscribe = worker.ringBuffer.subscribe((chunk) => {
        if (!res.writableEnded && !res.destroyed) {
          res.write(chunk);
        }
      }, 20000); // 20s backfill
    }
  }

  /**
   * Pre-warms the worker (if not active) and retrieves available audio tracks.
   */
  async getLiveStreamInfo(channelId: string, userId: string): Promise<any> {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });
    if (!channel || !channel.streamUrl) {
      throw new NotFoundException('Channel not found');
    }

    // Pre-warm the worker
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
