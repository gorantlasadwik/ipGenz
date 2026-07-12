import axios from 'axios';

const url = 'https://ipgenz-backend.onrender.com/stream/live/ed36015c-473d-4b7a-9736-5b6cac2b1966?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRlbW9AaXBnZW56LmNvbSIsInVzZXJJZCI6ImM3MzdlMzBmLWI4NTktNDRjMC1iYjAwLTU1NTJhNGU1OTkzNiIsImlzUHJlbWl1bVRyaWFsIjpmYWxzZSwic2Vzc2lvblRva2VuIjpudWxsLCJpYXQiOjE3ODM4NTM1NzcsImV4cCI6MTc4Mzg1NzE3N30.Mj3LmvR-ICBJP34_15kuOIhgLepP9FF-gisOKd_a-As&transcode=audio';

async function testTranscode() {
  console.log('Sending request to transcoded stream URL...');
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      },
      timeout: 15000 // 15s timeout
    });

    console.log(`Status Code: ${response.status}`);
    console.log('Headers:', response.headers);

    const stream = response.data;
    let bytesReceived = 0;
    
    stream.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      console.log(`Received chunk: ${chunk.length} bytes (Total: ${bytesReceived})`);
      if (bytesReceived >= 500000) { // received 500KB, stop
        console.log('Successfully received 500KB. Stream is active and sending data!');
        stream.destroy();
        process.exit(0);
      }
    });

    stream.on('end', () => {
      console.log('Stream ended prematurely');
      process.exit(1);
    });

    stream.on('error', (err: any) => {
      console.error('Stream error:', err.message);
      process.exit(1);
    });

  } catch (err: any) {
    if (err.response) {
      console.error(`HTTP Error: ${err.response.status}`);
      console.error('Body:', err.response.data);
    } else {
      console.error('Error connecting to backend:', err.message);
    }
    process.exit(1);
  }
}

testTranscode();
