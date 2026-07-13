import { Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { TsPacketAligner, TimestampContinuityEngine, PmtParser, AudioTrackInfo } from './timestamp-continuity';
import { RingBuffer } from './ring-buffer';

const ffmpegStatic = require('ffmpeg-static');

export interface WorkerOptions {
  channelId: string;
  streamUrl: string;
}

export class ChannelWorker {
  private readonly logger = new Logger(ChannelWorker.name);
  readonly channelId: string;
  readonly streamUrl: string;
  readonly ringBuffer: RingBuffer;

  private ffmpegProcess: ChildProcess | null = null;
  private aligner: TsPacketAligner | null = null;
  private continuity: TimestampContinuityEngine | null = null;
  private pmtParser: PmtParser | null = null;

  private active = false;
  private destroyed = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private idleTimeout: NodeJS.Timeout | null = null;
  private reconnectCount = 0;

  private audioTracks: AudioTrackInfo[] = [];

  constructor(opts: WorkerOptions) {
    this.channelId = opts.channelId;
    this.streamUrl = opts.streamUrl;
    this.ringBuffer = new RingBuffer(this.channelId);
  }

  /**
   * Start the ingest worker. Connects to provider and starts buffering.
   */
  start(): void {
    if (this.active || this.destroyed) return;
    this.active = true;
    this.logger.log(`[WorkerV3:${this.channelId}] Starting worker for stream: ${this.streamUrl}`);
    
    this.aligner = new TsPacketAligner();
    this.continuity = new TimestampContinuityEngine();
    this.pmtParser = new PmtParser();

    this.pmtParser.onTracksFound((tracks) => {
      this.audioTracks = tracks;
      this.logger.log(`[WorkerV3:${this.channelId}] Detected audio/subtitle tracks: ${JSON.stringify(tracks)}`);
    });

    // Wire the streams:
    // Aligner (bytes -> 188-byte packets) -> Continuity (rewrite timestamps)
    this.aligner.pipe(this.continuity);

    // Read packets from continuity, parse PAT/PMT, and write to RingBuffer
    this.continuity.on('data', (packet: Buffer) => {
      if (this.destroyed) return;
      this.pmtParser?.parsePacket(packet);
      this.ringBuffer.push(packet);
    });

    this.continuity.on('error', (err) => {
      this.logger.error(`[WorkerV3:${this.channelId}] Stream continuity error: ${err.message}`);
    });

    this.spawnFfmpeg();
  }

  private spawnFfmpeg(): void {
    if (this.destroyed || !this.active) return;

    this.logger.log(`[WorkerV3:${this.channelId}] Spawning FFmpeg ingest process. Reconnect attempt: ${this.reconnectCount}`);
    
    this.continuity?.resetSession();

    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;
    const isHlsInput = this.streamUrl.toLowerCase().includes('m3u8');
    const inputArgs: string[] = [];

    if (!isHlsInput) {
      inputArgs.push(
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      );
    } else {
      inputArgs.push(
        '-reconnect', '1',
        '-reconnect_delay_max', '5'
      );
    }

    const args: string[] = [
      ...inputArgs,
      '-fflags', '+genpts+discardcorrupt+igndts',
      '-user_agent', 'VLC/3.0.16',
      '-i', this.streamUrl,
      '-map', '0:v:0',
      '-map', '0:a?', // map all audio streams optionally
      '-c:v', 'copy',
      '-c:a', 'copy', // 100% passthrough, never transcoding on the ingest side
      '-avoid_negative_ts', 'make_zero',
      '-max_muxing_queue_size', '4096',
      '-f', 'mpegts',
      'pipe:1'
    ];

    try {
      this.ffmpegProcess = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      if (this.ffmpegProcess.stdout && this.aligner) {
        this.ffmpegProcess.stdout.pipe(this.aligner, { end: false });
      }

      this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg.includes('Error') || msg.includes('error') || msg.includes('warning') || msg.includes('Warning')) {
          this.logger.warn(`[FFmpegIngestV3:${this.channelId}] ${msg}`);
        }
      });

      this.ffmpegProcess.on('close', (code) => {
        this.logger.log(`[WorkerV3:${this.channelId}] FFmpeg closed with code ${code}`);
        this.ffmpegProcess = null;
        this.handleReconnect();
      });

      this.ffmpegProcess.on('error', (err) => {
        this.logger.error(`[WorkerV3:${this.channelId}] FFmpeg process error: ${err.message}`);
      });

    } catch (err: any) {
      this.logger.error(`[WorkerV3:${this.channelId}] Failed to spawn FFmpeg: ${err.message}`);
      this.handleReconnect();
    }
  }

  private handleReconnect(): void {
    if (this.destroyed || !this.active) return;

    this.reconnectCount++;
    const delay = Math.min(1000 * Math.pow(2, Math.min(this.reconnectCount - 1, 4)), 10000);
    this.logger.log(`[WorkerV3:${this.channelId}] Scheduling FFmpeg ingest reconnect in ${delay}ms`);

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.spawnFfmpeg();
    }, delay);
  }

  incrementSubscribers(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    this.reconnectCount = 0;
  }

  decrementSubscribers(onIdleDestroy: () => void): void {
    if (this.ringBuffer.subscriberCount === 0) {
      this.logger.log(`[WorkerV3:${this.channelId}] 0 active viewers left. Scheduling shutdown in 60s.`);
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      this.idleTimeout = setTimeout(() => {
        this.logger.log(`[WorkerV3:${this.channelId}] Idle timeout reached. Destroying worker.`);
        this.destroy();
        onIdleDestroy();
      }, 60000);
    }
  }

  get tracks(): AudioTrackInfo[] {
    return this.audioTracks;
  }

  get isRunning(): boolean {
    return this.active && !this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.active = false;
    this.logger.log(`[WorkerV3:${this.channelId}] Destroying worker.`);

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.idleTimeout) clearTimeout(this.idleTimeout);

    try {
      if (this.ffmpegProcess) {
        this.ffmpegProcess.kill('SIGKILL');
        this.ffmpegProcess = null;
      }
    } catch (_) {}

    if (this.aligner) {
      try {
        this.aligner.unpipe();
        this.aligner.destroy();
      } catch (_) {}
    }

    if (this.continuity) {
      try {
        this.continuity.removeAllListeners();
        this.continuity.destroy();
      } catch (_) {}
    }

    this.ringBuffer.clear();
  }
}
