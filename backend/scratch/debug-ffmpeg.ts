import { spawn } from 'child_process';
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

console.log('Spawning FFmpeg process...');
console.log('Path:', ffmpegStatic);
console.log('Args:', args.join(' '));

const proc = spawn(ffmpegStatic, args);

proc.stdout.on('data', (chunk) => {
  console.log(`STDOUT chunk: ${chunk.length} bytes`);
});

proc.stderr.on('data', (data) => {
  console.log(`STDERR: ${data.toString().trim()}`);
});

proc.on('close', (code) => {
  console.log(`FFmpeg process exited with code: ${code}`);
});

proc.on('error', (err) => {
  console.error('Failed to start FFmpeg process:', err);
});
