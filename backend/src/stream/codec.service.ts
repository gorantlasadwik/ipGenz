import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentType } from '@prisma/client';
import { exec } from 'child_process';
const ffprobeStatic = require('ffprobe-static');
import * as path from 'path';

export interface CodecProbeResult {
  videoCodec?: string;
  resolution?: string;
  fps?: number;
  bitrate?: number;
  audioCodec?: string;
  audioChannels?: number;
  audioLanguage?: string;
  allAudioStreams?: Array<{ id: number, codec: string, channels: number, language: string }>;
  subtitleFormats?: string;
  browserSupported: boolean;
  transcodingRequired: boolean;
  transcodeType: 'AUDIO' | 'VIDEO' | 'NONE';
  isBroken: boolean;
}

@Injectable()
export class CodecService implements OnModuleInit {
  private readonly logger = new Logger(CodecService.name);
  private isAnalyzingBackground = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Initializing Codec Analyzer Service...');
    // Start background analyzer queue (throttled loop) after a short delay
    setTimeout(() => {
      this.runBackgroundQueue().catch((err) =>
        this.logger.error('Background codec analysis error:', err),
      );
    }, 15000);
  }

  /**
   * Probes a stream URL using static ffprobe and extracts technical specifications.
   */
  async probeStream(streamUrl: string): Promise<CodecProbeResult> {
    return new Promise((resolve) => {
      const ffprobePath = process.env.NODE_ENV === 'production' ? 'ffprobe' : ffprobeStatic.path;
      // Limit probesize and analyzeduration to prevent hanging on live streams, timeout after 8s
      const cmd = `"${ffprobePath}" -user_agent "VLC/3.0.16 LibVLC/3.0.16" -v quiet -print_format json -show_format -show_streams -analyzeduration 5000000 -probesize 5000000 -timeout 8000000 "${streamUrl}"`;

      exec(cmd, (error, stdout) => {
        if (error) {
          this.logger.warn(`ffprobe failed for ${streamUrl}: ${error.message}`);
          return resolve({
            browserSupported: false,
            transcodingRequired: false,
            transcodeType: 'NONE',
            isBroken: true,
          });
        }

        try {
          const info = JSON.parse(stdout);
          const streams = info.streams || [];
          const format = info.format || {};

          // Extract Video Stream
          const videoStream = streams.find((s: any) => s.codec_type === 'video');
          const videoCodec = videoStream?.codec_name;
          const width = videoStream?.width;
          const height = videoStream?.height;
          const resolution = width && height ? `${width}x${height}` : undefined;
          
          let fps: number | undefined;
          if (videoStream?.avg_frame_rate) {
            const [num, den] = videoStream.avg_frame_rate.split('/');
            if (num && den && parseInt(den) !== 0) {
              fps = Math.round((parseInt(num) / parseInt(den)) * 100) / 100;
            }
          }

          const bitrate = videoStream?.bit_rate
            ? parseInt(videoStream.bit_rate)
            : format.bit_rate
            ? parseInt(format.bit_rate)
            : undefined;

          // Extract Audio Stream
          const audioStreams = streams.filter((s: any) => s.codec_type === 'audio');
          const audioStream = audioStreams[0];
          const audioCodec = audioStream?.codec_name;
          const audioChannels = audioStream?.channels;
          const audioLanguage = audioStream?.tags?.language || 'und';
          
          const allAudioStreams = audioStreams.map((s: any, idx: number) => ({
            id: idx, // Use sequential index for FFmpeg -map 0:a:X
            codec: s.codec_name,
            channels: s.channels,
            language: s.tags?.language || 'und'
          }));

          // Extract Subtitle tracks
          const subtitleStreams = streams.filter((s: any) => s.codec_type === 'subtitle');
          const subtitleFormats = subtitleStreams.map((s: any) => s.codec_name).join(',');

          // Determine compatibility
          // Compatible video codecs
          const supportedVideoCodecs = ['h264', 'vp8', 'vp9', 'av1'];
          // Compatible audio codecs
          const supportedAudioCodecs = ['aac', 'mp3', 'opus', 'vorbis'];

          const hasSupportedVideo = !videoCodec || supportedVideoCodecs.includes(videoCodec.toLowerCase());
          const hasSupportedAudio = !audioCodec || supportedAudioCodecs.includes(audioCodec.toLowerCase());

          let browserSupported = true;
          let transcodingRequired = false;
          let transcodeType: 'AUDIO' | 'VIDEO' | 'NONE' = 'NONE';

          // Check if video transcoding is required (unsupported video codec)
          if (videoCodec && !supportedVideoCodecs.includes(videoCodec.toLowerCase())) {
            browserSupported = false;
            transcodingRequired = true;
            transcodeType = 'VIDEO';
          } 
          // Check if audio transcoding is required (supported video, unsupported audio codec)
          else if (audioCodec && !supportedAudioCodecs.includes(audioCodec.toLowerCase())) {
            browserSupported = false;
            transcodingRequired = true;
            transcodeType = 'AUDIO';
          }

          resolve({
            videoCodec,
            resolution,
            fps,
            bitrate,
            audioCodec,
            audioChannels,
            audioLanguage,
            allAudioStreams,
            subtitleFormats: subtitleFormats || undefined,
            browserSupported,
            transcodingRequired,
            transcodeType,
            isBroken: false,
          });
        } catch (err) {
          this.logger.error(`Error parsing ffprobe output for ${streamUrl}:`, err);
          resolve({
            browserSupported: false,
            transcodingRequired: false,
            transcodeType: 'NONE',
            isBroken: true,
          });
        }
      });
    });
  }

  /**
   * Lazily probe and store/cache stream profile parameters on play.
   */
  async getOrAnalyzeStream(
    contentType: ContentType,
    contentId: string,
    streamUrl: string,
    providerId: string,
  ) {
    const existing = await this.prisma.streamProfile.findUnique({
      where: { contentType_contentId: { contentType, contentId } },
    });

    if (existing) {
      return existing;
    }

    this.logger.log(`Performing on-demand stream analysis for ${contentType} ${contentId}...`);
    const probe = await this.probeStream(streamUrl);

    return this.prisma.streamProfile.create({
      data: {
        providerId,
        contentType,
        contentId,
        videoCodec: probe.videoCodec,
        resolution: probe.resolution,
        fps: probe.fps,
        bitrate: probe.bitrate,
        audioCodec: probe.audioCodec,
        audioChannels: probe.audioChannels,
        audioLanguage: probe.audioLanguage,
        subtitleFormats: probe.subtitleFormats,
        browserSupported: probe.browserSupported,
        transcodingRequired: probe.transcodingRequired,
        transcodeType: probe.transcodeType,
        isBroken: probe.isBroken,
      },
    });
  }

  /**
   * Force scanning all un-analyzed provider stream profiles.
   */
  async forceTriggerScan() {
    if (this.isAnalyzingBackground) {
      return { status: 'busy', message: 'Codec analysis scan is already running.' };
    }
    this.logger.log('Force trigger active analysis scan requested.');
    this.runBackgroundQueue().catch((err) =>
      this.logger.error('Forced background codec scan error:', err),
    );
    return { status: 'started', message: 'Codec analysis scan triggered successfully.' };
  }

  private async runBackgroundQueue() {
    if (this.isAnalyzingBackground) return;
    this.isAnalyzingBackground = true;
    this.logger.log('Starting background stream codec scanning queue...');

    try {
      let active = true;
      while (active) {
        // Fetch one channel that doesn't have a profile
        const unanalyzedChannels = await this.prisma.$queryRaw<any[]>`
          SELECT lc.id, lc."streamUrl", lc."providerId"
          FROM "LiveChannel" lc
          LEFT JOIN "StreamProfile" sp ON lc.id = sp."contentId" AND sp."contentType" = 'CHANNEL'
          WHERE sp.id IS NULL
          LIMIT 1
        `;

        if (unanalyzedChannels.length > 0) {
          const ch = unanalyzedChannels[0];
          await this.getOrAnalyzeStream(
            ContentType.CHANNEL,
            ch.id,
            ch.streamUrl,
            ch.providerId,
          );
          // Wait 3 seconds to throttle background bandwidth/resource consumption
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        // Fetch one movie that doesn't have a profile
        const unanalyzedMovies = await this.prisma.$queryRaw<any[]>`
          SELECT m.id, m."streamUrl", m."providerId"
          FROM "Movie" m
          LEFT JOIN "StreamProfile" sp ON m.id = sp."contentId" AND sp."contentType" = 'MOVIE'
          WHERE sp.id IS NULL
          LIMIT 1
        `;

        if (unanalyzedMovies.length > 0) {
          const m = unanalyzedMovies[0];
          await this.getOrAnalyzeStream(
            ContentType.MOVIE,
            m.id,
            m.streamUrl,
            m.providerId,
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        // Fetch one episode that doesn't have a profile
        const unanalyzedEpisodes = await this.prisma.$queryRaw<any[]>`
          SELECT e.id, e."streamUrl", s."providerId"
          FROM "Episode" e
          JOIN "Series" s ON e."seriesId" = s.id
          LEFT JOIN "StreamProfile" sp ON e.id = sp."contentId" AND sp."contentType" = 'EPISODE'
          WHERE sp.id IS NULL
          LIMIT 1
        `;

        if (unanalyzedEpisodes.length > 0) {
          const ep = unanalyzedEpisodes[0];
          await this.getOrAnalyzeStream(
            ContentType.EPISODE,
            ep.id,
            ep.streamUrl,
            ep.providerId,
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        // Nothing left to analyze! Let's sleep for 60 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
    } catch (err) {
      this.logger.error('Background codec analysis loop crashed:', err);
    } finally {
      this.isAnalyzingBackground = false;
    }
  }

  /**
   * Fetch aggregate stream statistics.
   */
  async getMetrics() {
    const total = await this.prisma.streamProfile.count();
    const direct = await this.prisma.streamProfile.count({
      where: { transcodingRequired: false, isBroken: false },
    });
    const audioTranscode = await this.prisma.streamProfile.count({
      where: { transcodeType: 'AUDIO', isBroken: false },
    });
    const videoTranscode = await this.prisma.streamProfile.count({
      where: { transcodeType: 'VIDEO', isBroken: false },
    });
    const broken = await this.prisma.streamProfile.count({
      where: { isBroken: true },
    });

    return {
      total,
      direct,
      audioTranscode,
      videoTranscode,
      broken,
    };
  }
}
