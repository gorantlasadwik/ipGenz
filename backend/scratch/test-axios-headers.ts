import axios from 'axios';

const streamUrl = 'http://buxplay.org:8080/live/38485858999/83848595595/168.ts';

async function testAxiosHeaders() {
  console.log('Testing Axios request to IPTV provider with CUSTOM headers...');
  try {
    const response = await axios.get(streamUrl, {
      responseType: 'stream',
      decompress: false, // Do not decompress (prevent Axios from requesting/handling gzip)
      headers: {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*',
        'Accept-Encoding': 'identity', // Disable gzip/deflate
        'Connection': 'keep-alive',
      },
      timeout: 90000 // 90s
    });

    console.log(`HTTP Status: ${response.status}`);
    console.log('Response Headers:', response.headers);

    const stream = response.data;
    let bytesReceived = 0;
    let startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${elapsed}s] Downloaded: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
    }, 5000);

    stream.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
    });

    stream.on('end', () => {
      clearInterval(interval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Stream ENDED after ${elapsed}s. Total data: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
      process.exit(1);
    });

    stream.on('error', (err: any) => {
      clearInterval(interval);
      console.error('Stream error:', err.message);
      process.exit(1);
    });

    // Let it run for 60 seconds
    setTimeout(() => {
      clearInterval(interval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Success! Stream ran for ${elapsed}s without ending! Total: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
      stream.destroy();
      process.exit(0);
    }, 60000);

  } catch (err: any) {
    console.error('Axios request failed:', err.message);
    process.exit(1);
  }
}

testAxiosHeaders();
