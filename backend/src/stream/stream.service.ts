import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom } from 'rxjs';
import type { Response } from 'express';
import { CodecService } from './codec.service';
import { ContentType } from '@prisma/client';
import { spawn } from 'child_process';
const ffmpegStatic = require('ffmpeg-static');

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private codecService: CodecService,
  ) {}

  /**
   * Pure Node.js MPEG-TS PID filter for audio track selection.
   * Unlike FFmpeg (which gets blocked by IPTV providers on Render), this uses the same
   * Node.js HTTP proxy that already works. Reads 188-byte TS packets, parses PAT→PMT to
   * discover video & audio PIDs, then only forwards video PID + selected audio PID.
   */
  async handlePidFilterStream(streamUrl: string, audioTrackIndex: number, res: Response) {
    this.logger.log(`PID-filter stream: audioTrack=${audioTrackIndex}, url=${streamUrl}`);
    const PACKET_SIZE = 188;
    const SYNC_BYTE = 0x47;

    let response: any;
    try {
      response = await firstValueFrom(
        this.httpService.get(streamUrl, {
          responseType: 'stream',
          headers: { 'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16', 'Accept': '*/*' },
        }).pipe(
          catchError(err => { throw new HttpException('Provider Stream Offline', HttpStatus.BAD_GATEWAY); })
        )
      );
    } catch (e) {
      if (!res.headersSent) res.status(502).send('Stream Unavailable');
      return;
    }

    res.set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'no-cache, no-store',
      'Access-Control-Allow-Origin': '*',
    });

    let buf = Buffer.alloc(0);
    let pmtPid = -1;
    let videoPid = -1;
    const audioPids: number[] = [];
    let selectedAudioPid = -1;
    let pmtParsed = false;

    const parseSection = (data: Buffer, offset: number): void => {
      const ptr = data[offset];
      const base = offset + 1 + ptr;
      if (base + 3 >= data.length) return;
      const tableId = data[base];
      const secLen = ((data[base + 1] & 0x0F) << 8) | data[base + 2];
      if (tableId === 0x00) {
        for (let j = base + 8; j < base + 3 + secLen - 4; j += 4) {
          const prog = (data[j] << 8) | data[j + 1];
          if (prog !== 0) { pmtPid = ((data[j + 2] & 0x1F) << 8) | data[j + 3]; break; }
        }
      } else if (tableId === 0x02 && !pmtParsed) {
        const progInfoLen = ((data[base + 10] & 0x0F) << 8) | data[base + 11];
        let k = base + 12 + progInfoLen;
        while (k < base + 3 + secLen - 4 && k + 4 < data.length) {
          const streamType = data[k];
          const esPid = ((data[k + 1] & 0x1F) << 8) | data[k + 2];
          const esLen = ((data[k + 3] & 0x0F) << 8) | data[k + 4];
          if ([0x01, 0x02, 0x1B, 0x24].includes(streamType) && videoPid === -1) videoPid = esPid;
          if ([0x03, 0x04, 0x0F, 0x11, 0x81, 0x06, 0x87].includes(streamType)) audioPids.push(esPid);
          k += 5 + esLen;
        }
        if (audioPids.length > 0) {
          selectedAudioPid = audioPids[Math.min(audioTrackIndex, audioPids.length - 1)];
          this.logger.log(`PID filter: videoPid=${videoPid}, audioPids=${JSON.stringify(audioPids)}, selected=${selectedAudioPid}`);
          pmtParsed = true;
        }
      }
    };

    response.data.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= PACKET_SIZE) {
        if (buf[0] !== SYNC_BYTE) {
          const idx = buf.indexOf(SYNC_BYTE);
          if (idx === -1) { buf = Buffer.alloc(0); break; }
          buf = Buffer.from(buf.subarray(idx)); continue;
        }
        // CRITICAL: Copy the packet bytes — subarray is a VIEW, not a copy!
        // If we don't copy, buf reassignment below will corrupt pkt before it's written.
        const pkt = Buffer.from(buf.subarray(0, PACKET_SIZE));
        buf = Buffer.from(buf.subarray(PACKET_SIZE));
        const pid = ((pkt[1] & 0x1F) << 8) | pkt[2];
        const pusi = (pkt[1] & 0x40) !== 0;
        const afCtrl = (pkt[3] & 0x30) >> 4;
        let payloadOff = 4;
        if (afCtrl === 3) payloadOff += (pkt[4] + 1);
        if (pid === 0 && pusi && pmtPid === -1) parseSection(pkt, payloadOff);
        if (pid === pmtPid && pusi && !pmtParsed) parseSection(pkt, payloadOff);
        // Forward: PAT, null, PMT, video, selected audio; drop other audio PIDs
        const pass = pid === 0 || pid === 0x1FFF || pid === pmtPid || pid === videoPid
          || !pmtParsed || pid === selectedAudioPid;
        if (pass && !res.writableEnded) res.write(pkt);
      }
    });

    response.data.on('end', () => { if (!res.writableEnded) res.end(); });
    response.data.on('error', (e: any) => { this.logger.error('Stream error:', e.message); });
    res.on('close', () => { try { response.data.destroy(); } catch (_) {} });
  }

  /**
   * Spawns an on-the-fly FFmpeg transcoding process to convert unsupported codecs
   * and pipes the output directly to the HTTP response.
   */
  async handleTranscodeStream(streamUrl: string, transcodeType: 'AUDIO' | 'VIDEO', res: Response, audioTrack?: number, startTime?: number) {

    this.logger.log(`Transcoding stream on-the-fly. Type: ${transcodeType}, URL: ${streamUrl}, AudioTrack: ${audioTrack !== undefined ? audioTrack : 'default'}, Start: ${startTime || 0}`);

    const ffmpegPath = ffmpegStatic;
    const args: string[] = [];

    if (startTime !== undefined && startTime > 0) {
      args.push('-ss', startTime.toString());
    }

    // Do NOT use -re for live streams as it causes buffer starvation and lockups on network feeds.
    args.push('-i', streamUrl);

    if (audioTrack !== undefined) {
      // Map the first video stream and the selected audio stream index
      args.push('-map', '0:v?', '-map', `0:a:${audioTrack}`);
    }

    // Spoof User-Agent to bypass provider datacenter IP / bot blocks
    args.push('-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    if (transcodeType === 'AUDIO') {
      // Audio Transcode: copy video tracks, transcode audio to compatible stereo AAC
      args.push('-c:v', 'copy');
      args.push('-c:a', 'aac');
      args.push('-b:a', '128k');
      args.push('-ac', '2');
    } else {
      // Video Transcode (e.g. MPEG-2/VC-1): transcode video to H.264 and audio to AAC
      args.push('-c:v', 'libx264');
      args.push('-preset', 'ultrafast');
      args.push('-crf', '23');
      args.push('-c:a', 'aac');
      args.push('-b:a', '128k');
      args.push('-ac', '2');
    }

    // Use -copyts to ensure the transcoded audio track maintains the same timestamps as the copied video track
    // If we don't copy timestamps, the audio resets to 0 while video stays at the live stream's timestamp,
    // causing a massive A/V desync that makes mpegts.js completely drop the audio playback!
    args.push('-copyts');
    args.push('-muxdelay', '0');
    args.push('-max_muxing_queue_size', '1024');
    args.push('-f', 'mpegts');
    args.push('pipe:1');

    res.set({
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    });

    const ffmpegProcess = spawn(ffmpegPath, args) as any;

    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (data: any) => {
      // Verbose logging of FFmpeg progress can be mapped here if needed
      // this.logger.verbose(`FFmpeg progress: ${data.toString()}`);
    });

    ffmpegProcess.on('close', (code: any) => {
      this.logger.log(`FFmpeg transcoding process exited with code ${code}`);
    });

    res.on('close', () => {
      this.logger.log('Client connection closed. Killing FFmpeg process...');
      ffmpegProcess.kill('SIGKILL');
    });
  }

  private isDolbyName(name?: string): boolean {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.includes('dolby') || 
           lower.includes('ac3') || 
           lower.includes('eac3') || 
           lower.includes('5.1') || 
           lower.includes('dd5') || 
           lower.includes('dd+') || 
           lower.includes('surround');
  }

  async proxyLiveStream(channelId: string, audioTrack: number | undefined, userId: string, res: Response, transcode?: string) {
    this.logger.log(`Proxying Live Stream for channel: ${channelId}, audioTrack: ${audioTrack}, Transcode: ${transcode}`);

    // Look up the real stream URL from the database and verify ownership
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
      include: { provider: true },
    });

    // If channel not found in DB, fall back to test stream for demo
    const streamUrl = channel?.streamUrl || 'http://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

    if (!channel) {
      this.logger.warn(`Channel ${channelId} not found in DB, using test stream`);
    }

    // Run dynamic on-demand stream analysis if channel is real
    let profile = null;
    if (channel) {
      try {
        profile = await this.codecService.getOrAnalyzeStream(
          ContentType.CHANNEL,
          channel.id,
          streamUrl,
          channel.providerId,
        );
      } catch (err) {
        this.logger.error(`Failed to retrieve/analyze stream profile: ${err.message}`);
      }
    }

    const forceTranscode = transcode === 'audio' || transcode === 'video';
    const transcodeType = transcode === 'video' ? 'VIDEO' : 'AUDIO';
    const isDolby = channel && this.isDolbyName(channel.name);

    // If a specific audio track is requested, transcode using FFmpeg so the browser can decode the selected audio track (AAC)
    if (audioTrack !== undefined) {
      const type = (profile && profile.transcodeType === 'VIDEO') ? 'VIDEO' : 'AUDIO';
      return this.handleTranscodeStream(streamUrl, type as any, res, audioTrack);
    }

    if (forceTranscode || (profile && profile.transcodingRequired && profile.transcodeType) || isDolby) {
      const type = forceTranscode ? transcodeType : ((profile && profile.transcodeType === 'VIDEO') ? 'VIDEO' : 'AUDIO');
      return this.handleTranscodeStream(streamUrl, type as any, res);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(streamUrl, {
          responseType: 'stream',
          headers: {
            // Spoof headers to bypass basic provider blocks
            'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
            'Accept': '*/*',
          }
        }).pipe(
          catchError((error) => {
            this.logger.error(`Error connecting to provider: ${error.message}`);
            throw new HttpException('Provider Stream Offline', HttpStatus.BAD_GATEWAY);
          }),
        ),
      );

      // Copy essential headers
      res.set({
        'Content-Type': response.headers['content-type'] || 'video/mp2t',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      });

      // Pipe the external stream directly to our client response
      response.data.pipe(res);

    } catch (error) {
      this.logger.error(`Stream proxy failed: ${error.message}`);
      if (!res.headersSent) {
        res.status(502).send('Stream Unavailable');
      }
    }
  }

  async getLiveStreamInfo(channelId: string, userId: string) {
    const channel = await this.prisma.liveChannel.findFirst({
      where: { id: channelId, provider: { userId } },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    try {
      const probe = await this.codecService.probeStream(channel.streamUrl);
      return probe;
    } catch (err) {
      return { allAudioStreams: [] };
    }
  }

  async getMovieStreamInfo(movieId: string, userId: string) {
    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, provider: { userId } },
    });
    if (!movie) throw new NotFoundException('Movie not found');

    try {
      return await this.codecService.probeStream(movie.streamUrl);
    } catch (err) {
      return { allAudioStreams: [] };
    }
  }

  async proxyMovieStream(req: any, movieId: string, userId: string, res: Response, audioTrack?: number, start?: number, transcode?: string) {
    this.logger.log(`Proxying Movie Stream: ${movieId}, AudioTrack: ${audioTrack}, Start: ${start}, Transcode: ${transcode}`);

    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, provider: { userId } },
    });

    if (!movie) {
      throw new NotFoundException('Movie not found');
    }

    // Run dynamic on-demand stream analysis
    let profile = null;
    try {
      profile = await this.codecService.getOrAnalyzeStream(
        ContentType.MOVIE,
        movie.id,
        movie.streamUrl,
        movie.providerId,
      );
    } catch (err) {
      this.logger.error(`Failed to retrieve/analyze stream profile: ${err.message}`);
    }

    const forceTranscode = transcode === 'audio' || transcode === 'video';
    const transcodeType = transcode === 'video' ? 'VIDEO' : 'AUDIO';
    const isDolby = this.isDolbyName(movie.name);

    // Direct playback vs transcoding logic
    // If a specific audio track or start time is requested, we MUST transcode/remux using FFmpeg.
    if (audioTrack !== undefined || start !== undefined || forceTranscode || (profile && profile.transcodingRequired && profile.transcodeType) || isDolby) {
      const type = forceTranscode ? transcodeType : ((profile && profile.transcodeType === 'VIDEO') ? 'VIDEO' : 'AUDIO');
      return this.handleTranscodeStream(movie.streamUrl, type, res, audioTrack, start);
    }

    // Proxy the stream directly while supporting Range requests
    this.logger.log(`No transcoding required for movie ${movieId}. Proxying directly from provider.`);
    
    try {
      const headers: any = {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*',
      };
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await firstValueFrom(
        this.httpService.get(movie.streamUrl, {
          responseType: 'stream',
          headers,
          validateStatus: status => status < 400 || status === 403 || status === 404,
        })
      );

      // Copy essential headers back to the client
      const headersToCopy = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      headersToCopy.forEach(h => {
        if (response.headers[h]) {
          res.setHeader(h, response.headers[h]);
        }
      });
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.status(response.status);
      response.data.pipe(res);
    } catch (error) {
      this.logger.error(`Movie stream proxy failed: ${error.message}`);
      if (!res.headersSent) {
        res.status(502).send('Stream Unavailable');
      }
    }
  }

  async getEpisodeStreamInfo(episodeId: string, userId: string) {
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, season: { series: { provider: { userId } } } },
    });
    if (!episode) throw new NotFoundException('Episode not found');

    try {
      return await this.codecService.probeStream(episode.streamUrl);
    } catch (err) {
      return { allAudioStreams: [] };
    }
  }

  async proxyEpisodeStream(req: any, episodeId: string, userId: string, res: Response, audioTrack?: number, start?: number, transcode?: string) {
    this.logger.log(`Proxying Episode Stream: ${episodeId}, AudioTrack: ${audioTrack}, Start: ${start}, Transcode: ${transcode}`);

    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, season: { series: { provider: { userId } } } },
      include: { season: { include: { series: { include: { provider: true } } } } }
    });

    if (!episode) {
      throw new NotFoundException('Episode not found');
    }

    // Run dynamic on-demand stream analysis
    let profile = null;
    if (episode.season && episode.season.series) {
      try {
        profile = await this.codecService.getOrAnalyzeStream(
          ContentType.EPISODE,
          episode.id,
          episode.streamUrl,
          episode.season.series.providerId,
        );
      } catch (err) {
        this.logger.error(`Failed to retrieve/analyze stream profile: ${err.message}`);
      }
    }

    const forceTranscode = transcode === 'audio' || transcode === 'video';
    const transcodeType = transcode === 'video' ? 'VIDEO' : 'AUDIO';
    const isDolby = this.isDolbyName(episode.title || undefined) || (episode.season?.series && this.isDolbyName(episode.season.series.name));

    // Direct playback vs transcoding logic
    // If a specific audio track or start time is requested, we MUST transcode/remux using FFmpeg.
    if (audioTrack !== undefined || start !== undefined || forceTranscode || (profile && profile.transcodingRequired && profile.transcodeType) || isDolby) {
      const type = forceTranscode ? transcodeType : ((profile && profile.transcodeType === 'VIDEO') ? 'VIDEO' : 'AUDIO');
      return this.handleTranscodeStream(episode.streamUrl, type, res, audioTrack, start);
    }

    // Proxy the stream directly while supporting Range requests
    this.logger.log(`No transcoding required for episode ${episodeId}. Proxying directly from provider.`);
    
    try {
      const headers: any = {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*',
      };
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await firstValueFrom(
        this.httpService.get(episode.streamUrl, {
          responseType: 'stream',
          headers,
          validateStatus: status => status < 400 || status === 403 || status === 404,
        })
      );

      // Copy essential headers back to the client
      const headersToCopy = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      headersToCopy.forEach(h => {
        if (response.headers[h]) {
          res.setHeader(h, response.headers[h]);
        }
      });
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.status(response.status);
      response.data.pipe(res);
    } catch (error) {
      this.logger.error(`Episode stream proxy failed: ${error.message}`);
      if (!res.headersSent) {
        res.status(502).send('Stream Unavailable');
      }
    }
  }

  // --- DOWNLOAD PROXIES ---
  async validateDownloadLimitOnly(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isPremiumTrial) {
      const now = new Date();
      let shouldReset = true;
      if (user.lastDownloadAt) {
        const lastDownloadDate = new Date(user.lastDownloadAt);
        const isSameDay =
          now.getUTCFullYear() === lastDownloadDate.getUTCFullYear() &&
          now.getUTCMonth() === lastDownloadDate.getUTCMonth() &&
          now.getUTCDate() === lastDownloadDate.getUTCDate();

        if (isSameDay) {
          shouldReset = false;
        }
      }

      if (!shouldReset && user.downloadsToday >= 1) {
        throw new HttpException(
          'Premium trial accounts are limited to 1 download per day.',
          HttpStatus.FORBIDDEN
        );
      }
    }
  }

  private async checkAndIncrementDownloadLimit(userId: string) {
    const user: any = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isPremiumTrial) {
      const now = new Date();
      let shouldReset = true;
      if (user.lastDownloadAt) {
        const lastDownloadDate = new Date(user.lastDownloadAt);
        const isSameDay =
          now.getUTCFullYear() === lastDownloadDate.getUTCFullYear() &&
          now.getUTCMonth() === lastDownloadDate.getUTCMonth() &&
          now.getUTCDate() === lastDownloadDate.getUTCDate();

        if (isSameDay) {
          shouldReset = false;
        }
      }

      if (!shouldReset && user.downloadsToday >= 1) {
        throw new HttpException(
          'Premium trial accounts are limited to 1 download per day.',
          HttpStatus.FORBIDDEN
        );
      }

      // Update download metrics
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastDownloadAt: now,
          downloadsToday: shouldReset ? 1 : user.downloadsToday + 1,
        } as any,
      });
    }
  }

  async proxyDownloadMovie(movieId: string, userId: string, targetUserId: string, res: Response) {
    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, provider: { userId: targetUserId } },
    });
    if (!movie) throw new NotFoundException('Movie not found');
    
    await this.checkAndIncrementDownloadLimit(userId);

    // Instead of streaming and transcode, we just redirect or pipe with Content-Disposition
    // But since the PRD says "Downloaded files must be stored: downloads/{user_id}/", 
    // a real implementation would use ffmpeg to save to disk. 
    // For now, we will initiate a download attachment response by streaming it directly.
    const filename = `${movie.name.replace(/[^a-z0-9]/gi, '_')}.mp4`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    // We can simply pipe from httpService to bypass CORS and force download
    try {
      const response = await firstValueFrom(
        this.httpService.get(movie.streamUrl, {
          responseType: 'stream',
          headers: {
            'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
          }
        })
      );
      response.data.pipe(res);
    } catch (e) {
      res.status(500).send('Failed to download movie');
    }
  }

  async proxyDownloadEpisode(episodeId: string, userId: string, targetUserId: string, res: Response) {
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, season: { series: { provider: { userId: targetUserId } } } },
      include: { season: { include: { series: true } } }
    });
    if (!episode) throw new NotFoundException('Episode not found');
    
    await this.checkAndIncrementDownloadLimit(userId);

    const filename = `${episode.season.series.name.replace(/[^a-z0-9]/gi, '_')}_S${episode.season.seasonNumber}_E${episode.episodeNumber}.mp4`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    try {
      const response = await firstValueFrom(
        this.httpService.get(episode.streamUrl, {
          responseType: 'stream',
          headers: {
            'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
          }
        })
      );
      response.data.pipe(res);
    } catch (e) {
      res.status(500).send('Failed to download episode');
    }
  }
}
