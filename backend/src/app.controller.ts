import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  @Get('debug-ffmpeg')
  async debugFfmpeg(@Res() res: any) {
    const { spawn } = require('child_process');
    const ffmpegStatic = require('ffmpeg-static');
    const streamUrl = 'http://buxplay.org:8080/live/38485858999/83848595595/135457.ts';
    
    const args = [
      '-user_agent', 'VLC/3.0.16 LibVLC/3.0.16',
      '-i', streamUrl,
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

    res.set({
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    res.write(`Spawning FFmpeg from path: ${ffmpegStatic}\n`);
    res.write(`Args: ${args.join(' ')}\n\n`);

    const proc = spawn(ffmpegStatic, args);

    proc.stdout.on('data', (chunk: any) => {
      res.write(`[STDOUT] Received ${chunk.length} bytes\n`);
    });

    proc.stderr.on('data', (data: any) => {
      res.write(`[STDERR] ${data.toString()}`);
    });

    proc.on('close', (code: any) => {
      res.write(`\n[CLOSE] FFmpeg exited with code ${code}\n`);
      res.end();
    });

    proc.on('error', (err: any) => {
      res.write(`\n[ERROR] Failed to start FFmpeg: ${err.message}\n`);
      res.end();
    });
  }
}

