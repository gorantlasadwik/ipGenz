import { spawn, ChildProcess } from 'child_process';
import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

const ffmpegStatic = require('ffmpeg-static');

export class HlsSegmenter {
  private readonly logger = new Logger(HlsSegmenter.name);
  private ffmpegProcess: ChildProcess | null = null;
  private destroyed = false;
  readonly playlistPath: string;

  constructor(
    private readonly channelId: string,
    private readonly tempDir: string,
    private readonly streamUrl: string,
  ) {
    this.playlistPath = path.join(this.tempDir, 'playlist.m3u8');
  }

  /**
   * Spawns the FFmpeg HLS muxer process.
   */
  start(): void {
    if (this.ffmpegProcess || this.destroyed) return;

    // Ensure temp directory exists and is clean
    if (fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      } catch (e: any) {
        this.logger.warn(`[HlsSegmenter:${this.channelId}] Directory clean warning: ${e.message}`);
      }
    }
    try {
      fs.mkdirSync(this.tempDir, { recursive: true });
    } catch (e: any) {
      this.logger.error(`[HlsSegmenter:${this.channelId}] Failed to create directory: ${e.message}`);
    }

    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;

    const isHlsInput = this.streamUrl.toLowerCase().includes('m3u8');
    const inputArgs: string[] = [];

    if (!isHlsInput) {
      // Reconnect options for continuous TS streams
      inputArgs.push(
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      );
    } else {
      // Reconnect options for HLS segment downloads
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

      // Map all video and audio streams
      '-map', '0:v?',
      '-map', '0:a?',

      // Video: copy directly (zero CPU usage)
      '-c:v', 'copy',

      // Audio: convert all tracks to standard AAC 128k stereo (insures Dolby/AC3/EAC3/DTS works everywhere)
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '48000',

      // Timing / Muxing parameters
      '-avoid_negative_ts', 'make_zero',
      '-max_muxing_queue_size', '4096',

      // HLS packaging parameters
      '-f', 'hls',
      '-hls_time', '2',              // 2-second segments
      '-hls_list_size', '6',         // rolling window of 6 segments (~12s buffer)
      '-hls_flags', 'delete_segments', // auto delete stale segments
      '-hls_segment_filename', path.join(this.tempDir, 'seg_%d.ts'),
      this.playlistPath,
    ];

    this.logger.log(`[HlsSegmenter:${this.channelId}] Spawning FFmpeg direct ingest: ffmpeg ${args.join(' ')}`);

    const proc = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'], // ignore stdin/stdout, pipe stderr for diagnostics
    });

    this.ffmpegProcess = proc;

    proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      // Log warnings or errors
      if (msg.includes('Error') || msg.includes('error') || msg.includes('warning') || msg.includes('Warning')) {
        this.logger.warn(`[HlsSegmenter:${this.channelId}][FFmpeg] ${msg}`);
      }
    });

    proc.on('error', (err: Error) => {
      this.logger.error(`[HlsSegmenter:${this.channelId}] process error: ${err.message}`);
    });

    proc.on('close', (code: number) => {
      this.logger.log(`[HlsSegmenter:${this.channelId}] process exited with code ${code}`);
      this.ffmpegProcess = null;

      if (!this.destroyed) {
        this.logger.warn(`[HlsSegmenter:${this.channelId}] process closed unexpectedly — respawning in 1000ms`);
        setTimeout(() => {
          if (!this.destroyed) this.start();
        }, 1000);
      }
    });
  }

  /**
   * Stub for backward compatibility.
   */
  write(chunk: Buffer): boolean {
    return true;
  }

  /**
   * Stub for backward compatibility.
   */
  onDrain(callback: () => void): void {}

  /**
   * Cleanly terminate FFmpeg and purge segment files.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.logger.log(`[HlsSegmenter:${this.channelId}] Destroying segmenter and purging directory: ${this.tempDir}`);

    if (this.ffmpegProcess) {
      try { this.ffmpegProcess.kill('SIGKILL'); } catch (_) {}
      this.ffmpegProcess = null;
    }

    // Purge HLS temp files from disk
    setTimeout(() => {
      if (fs.existsSync(this.tempDir)) {
        try {
          fs.rmSync(this.tempDir, { recursive: true, force: true });
        } catch (e: any) {
          this.logger.error(`[HlsSegmenter:${this.channelId}] Failed to clean temp dir: ${e.message}`);
        }
      }
    }, 1000);
  }
}
