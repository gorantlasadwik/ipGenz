import { spawn } from 'child_process';
import axios from 'axios';
const ffmpegStatic = require('ffmpeg-static');

const streamUrl = 'http://buxplay.org:8080/live/38485858999/83848595595/168.ts';

async function testLocalTranscode() {
  console.log('Testing local FFmpeg transcoding with stdin pipe...');
  
  let response: any;
  try {
    response = await axios.get(streamUrl, {
      responseType: 'stream',
      decompress: false,
      headers: {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      }
    });
  } catch (err: any) {
    console.error('Failed to connect to IPTV provider:', err.message);
    process.exit(1);
  }

  const ffmpegPath = ffmpegStatic;
  const args = [
    '-fflags', '+genpts+discardcorrupt+igndts',
    '-i', 'pipe:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-avoid_negative_ts', 'make_zero',
    '-muxdelay', '0',
    '-max_muxing_queue_size', '1024',
    '-f', 'mpegts',
    'pipe:1'
  ];

  console.log('Spawning FFmpeg with args:', args.join(' '));
  const ffmpegProcess = spawn(ffmpegPath, args);

  // Pipe Axios response into FFmpeg's stdin
  response.data.pipe(ffmpegProcess.stdin);

  let outputBytes = 0;
  ffmpegProcess.stdout.on('data', (chunk) => {
    outputBytes += chunk.length;
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.log(`[FFmpeg Stderr] ${data.toString().trim()}`);
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg exited with code ${code}. Total transcoded bytes: ${outputBytes}`);
    process.exit(code === 0 ? 0 : 1);
  });

  // Let it run for 10 seconds to verify success
  setTimeout(() => {
    console.log('Success! Stream is running fine. Killing process...');
    ffmpegProcess.kill('SIGKILL');
    response.data.destroy();
    process.exit(0);
  }, 10000);
}

testLocalTranscode().catch(console.error);
