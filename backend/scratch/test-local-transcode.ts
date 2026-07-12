import axios from 'axios';

const url = 'http://localhost:3001/debug-ffmpeg?id=261c910c-e29d-443d-ae6d-8238bdd4bc43';

async function testLocalTranscode() {
  console.log('Sending request to local debug-ffmpeg endpoint...');
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 20000 // 20s
    });

    console.log(`HTTP Status: ${response.status}`);
    const stream = response.data;
    let bytesReceived = 0;
    let startTime = Date.now();

    stream.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      console.log(`[${((Date.now() - startTime) / 1000).toFixed(1)}s] Received chunk: ${chunk.length} bytes (Total: ${(bytesReceived / 1024).toFixed(1)} KB)`);
    });

    stream.on('end', () => {
      console.log(`Stream ended. Total: ${(bytesReceived / 1024).toFixed(1)} KB`);
      process.exit(0);
    });

    stream.on('error', (err: any) => {
      console.error('Stream error:', err.message);
      process.exit(1);
    });

    // Let it run for 12 seconds to see if it streams continuously
    setTimeout(() => {
      console.log(`\nLocal stream is still active and streaming perfectly after 12s! Total data received: ${(bytesReceived / 1024).toFixed(1)} KB`);
      stream.destroy();
      process.exit(0);
    }, 12000);

  } catch (err: any) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}

testLocalTranscode();
