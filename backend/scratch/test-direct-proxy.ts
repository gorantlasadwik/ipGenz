import { exec } from 'child_process';

function runCmd(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        resolve(`ERROR: ${error.message}\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`);
      } else {
        resolve(stdout || stderr || 'SUCCESS (No Output)');
      }
    });
  });
}

async function main() {
  console.log('=== Checking Render Environment Globals ===');
  
  console.log('\nChecking global ffprobe:');
  const ffprobeRes = await runCmd('ffprobe -version');
  console.log(ffprobeRes);

  console.log('\nChecking global ffmpeg:');
  const ffmpegRes = await runCmd('ffmpeg -version');
  console.log(ffmpegRes);

  console.log('\nChecking static ffprobe execution:');
  const staticFfprobePath = '/opt/render/project/src/backend/node_modules/ffprobe-static/bin/linux/x64/ffprobe';
  const staticFfprobeRes = await runCmd(`"${staticFfprobePath}" -version`);
  console.log(staticFfprobeRes);
}

main().catch(console.error);
