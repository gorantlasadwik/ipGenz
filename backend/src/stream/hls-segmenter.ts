import { spawn, ChildProcess } from 'child_process';
import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

const ffmpegStatic = require('ffmpeg-static');

export class HlsSegmenter {
  private readonly logger = new Logger(HlsSegmenter.name);
  private ffmpegProcess: ChildProcess | null = null;
  private ffmpegStdin: any = null;
  private destroyed = false;
  readonly playlistPath: string;

  constructor(
    private readonly channelId: string,
    private readonly tempDir: string,
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
      } catch (_) {}
    }
    fs.mkdirSync(this.tempDir, { recursive: true });

    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : ffmpegStatic;

    const args: string[] = [
      '-fflags', '+genpts+discardcorrupt+igndts',
      '-i', 'pipe:0',

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

    this.logger.log(`[HlsSegmenter:${this.channelId}] Spawning FFmpeg: ffmpeg ${args.join(' ')}`);

    const proc = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'pipe'], // ignore stdout (output goes directly to files), pipe stdin & stderr
    });

    this.ffmpegProcess = proc;
    this.ffmpegStdin = proc.stdin;

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
      this.ffmpegStdin = null;

      if (!this.destroyed) {
        this.logger.warn(`[HlsSegmenter:${this.channelId}] process closed unexpectedly — respawning in 500ms`);
        setTimeout(() => {
          if (!this.destroyed) this.start();
        }, 500);
      }
    });
  }

  /**
   * Write raw incoming TS stream data into FFmpeg stdin.
   */
  write(chunk: Buffer): boolean {
    if (this.destroyed || !this.ffmpegStdin || this.ffmpegStdin.destroyed) {
      return false;
    }
    try {
      return this.ffmpegStdin.write(chunk);
    } catch (e: any) {
      this.logger.error(`[HlsSegmenter:${this.channelId}] Stdin write error: ${e.message}`);
      return false;
    }
  }

  /**
   * Listen to stdin drain events for backpressure.
   */
  onDrain(callback: () => void): void {
    if (this.ffmpegStdin) {
      this.ffmpegStdin.once('drain', callback);
    }
  }

  /**
   * Cleanly terminate FFmpeg and purge segment files.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.logger.log(`[HlsSegmenter:${this.channelId}] Destroying segmenter and purging directory: ${this.tempDir}`);

    if (this.ffmpegProcess) {
      try { this.ffmpegStdin?.destroy(); } catch (_) {}
      try { this.ffmpegProcess.kill('SIGKILL'); } catch (_) {}
      this.ffmpegProcess = null;
      this.ffmpegStdin = null;
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
