/**
 * ffprobe.service.ts — Stream Capability Scanner
 *
 * Uses ffprobe to detect:
 * - Video codec (H.264, HEVC, MPEG-2, AV1, etc.)
 * - All audio tracks (codec + language + pid)
 * - Subtitle tracks
 *
 * Results are cached per-channel and only re-run when explicitly requested.
 */

import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

export interface AudioTrack {
  index: number;
  codec: string;
  language: string;
  pid?: number;
  channelLayout?: string;
  sampleRate?: number;
}

export interface SubtitleTrack {
  index: number;
  codec: string;
  language: string;
}

export interface StreamProfile {
  videoCodec: string;          // e.g. 'h264', 'hevc', 'mpeg2video'
  videoWidth?: number;
  videoHeight?: number;
  fps?: number;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  container: string;           // e.g. 'mpegts', 'hls', 'rtmp'
  scannedAt: number;
}

@Injectable()
export class FfprobeService {
  private readonly logger = new Logger('FfprobeService');
  private readonly cache = new Map<string, StreamProfile>();

  /**
   * Scans a stream URL using ffprobe and returns its codec/track profile.
   * Results are cached for 5 minutes.
   */
  async scanStream(url: string): Promise<StreamProfile> {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.scannedAt < 5 * 60 * 1000) {
      return cached;
    }

    try {
      const result = await this.runFfprobe(url);
      this.cache.set(url, result);
      return result;
    } catch (err) {
      this.logger.warn(`[FfprobeService] Failed to scan ${url}: ${err.message}`);
      // Return a safe default assuming H.264/AAC (most common IPTV format)
      return this.defaultProfile();
    }
  }

  private runFfprobe(url: string): Promise<StreamProfile> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        '-user_agent', 'VLC/3.0.16',
        '-analyzeduration', '5000000',
        '-probesize', '2000000',
        url,
      ];

      let stdout = '';
      let stderr = '';
      const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('ffprobe timeout'));
      }, 12000);

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0 && !stdout) {
          reject(new Error(`ffprobe exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }

        try {
          const json = JSON.parse(stdout);
          resolve(this.parseProbeResult(json));
        } catch (e) {
          reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private parseProbeResult(json: any): StreamProfile {
    const streams: any[] = json.streams || [];
    const format = json.format || {};

    const videoStream = streams.find(s => s.codec_type === 'video');
    const audioStreams = streams.filter(s => s.codec_type === 'audio');
    const subtitleStreams = streams.filter(s => s.codec_type === 'subtitle');

    const videoCodec = videoStream?.codec_name || 'h264';
    const videoWidth = videoStream?.width;
    const videoHeight = videoStream?.height;
    const fpsParts = videoStream?.avg_frame_rate?.split('/');
    const fps = fpsParts?.length === 2
      ? parseFloat(fpsParts[0]) / parseFloat(fpsParts[1])
      : undefined;

    const audioTracks: AudioTrack[] = audioStreams.map((s, i) => ({
      index: i,
      codec: s.codec_name || 'aac',
      language: s.tags?.language || s.tags?.LANGUAGE || (i === 0 ? 'default' : `track${i}`),
      pid: s.id,
      channelLayout: s.channel_layout,
      sampleRate: s.sample_rate ? parseInt(s.sample_rate) : undefined,
    }));

    const subtitleTracks: SubtitleTrack[] = subtitleStreams.map((s, i) => ({
      index: i,
      codec: s.codec_name || 'dvb_subtitle',
      language: s.tags?.language || s.tags?.LANGUAGE || `sub${i}`,
    }));

    const container = format.format_name?.includes('mpegts') ? 'mpegts'
      : format.format_name?.includes('hls') ? 'hls'
      : 'mpegts';

    return {
      videoCodec,
      videoWidth,
      videoHeight,
      fps,
      audioTracks: audioTracks.length > 0 ? audioTracks : [{ index: 0, codec: 'aac', language: 'default' }],
      subtitleTracks,
      container,
      scannedAt: Date.now(),
    };
  }

  private defaultProfile(): StreamProfile {
    return {
      videoCodec: 'h264',
      audioTracks: [{ index: 0, codec: 'aac', language: 'default' }],
      subtitleTracks: [],
      container: 'mpegts',
      scannedAt: Date.now(),
    };
  }

  invalidate(url: string): void {
    this.cache.delete(url);
  }
}
