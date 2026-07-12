import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('debug-ffmpeg')
  async debugFfmpeg(@Res() res: any, @Query('id') channelId?: string) {
    const { spawn } = require('child_process');
    const ffmpegStatic = require('ffmpeg-static');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const targetId = channelId || '261c910c-e29d-443d-ae6d-8238bdd4bc43';
    
    res.set({
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    try {
      const channel = await prisma.liveChannel.findUnique({
        where: { id: targetId }
      });

      if (!channel) {
        res.write(`Channel not found in database: ${targetId}\n`);
        res.end();
        await prisma.$disconnect();
        return;
      }

      res.write(`Channel: ${channel.name}\n`);
      res.write(`IPTV Source URL: ${channel.streamUrl}\n`);
      res.write(`Spawning FFmpeg from path: ${ffmpegStatic}\n`);

      const args = [
        '-user_agent', 'VLC/3.0.16 LibVLC/3.0.16',
        '-i', channel.streamUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-copyts',
        '-muxdelay', '0',
        '-max_muxing_queue_size', '1024',
        '-f', 'mpegts',
        'pipe:1'
      ];

      res.write(`Args: ${args.join(' ')}\n\n`);

      const proc = spawn(ffmpegStatic, args);
      let receivedBytes = 0;
      let startTime = Date.now();

      proc.stdout.on('data', (chunk: any) => {
        receivedBytes += chunk.length;
        res.write(`[STDOUT] Received ${chunk.length} bytes (Total: ${receivedBytes})\n`);
      });

      proc.stderr.on('data', (data: any) => {
        res.write(`[STDERR] ${data.toString()}`);
      });

      proc.on('close', (code: any) => {
        res.write(`\n[CLOSE] FFmpeg exited with code ${code} after ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);
        res.end();
      });

      proc.on('error', (err: any) => {
        res.write(`\n[ERROR] Failed to start FFmpeg: ${err.message}\n`);
        res.end();
      });

      // Automatically terminate after 15 seconds to prevent hanging
      setTimeout(() => {
        if (!proc.killed) {
          res.write(`\n[TIMEOUT] Auto-killing FFmpeg process after 15s...\n`);
          proc.kill('SIGKILL');
        }
      }, 15000);

    } catch (e: any) {
      res.write(`[ERROR] ${e.message}\n`);
      res.end();
    } finally {
      await prisma.$disconnect();
    }
  }
}


