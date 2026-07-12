import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';

const prisma = new PrismaClient();
const jwtService = new JwtService({
  secret: process.env.JWT_SECRET || '26062006Gk',
});

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { not: '' } }
  });

  if (!user) {
    console.error('No users found in database');
    process.exit(1);
  }

  // Find a working channel
  const channel = await prisma.liveChannel.findFirst({
    where: { name: { contains: 'Star' } } // Look for Star Maa or similar working channels
  }) || await prisma.liveChannel.findFirst({
    where: { streamUrl: { contains: '.ts' } }
  }) || await prisma.liveChannel.findFirst();

  if (!channel) {
    console.error('No channels found in database');
    process.exit(1);
  }

  const payload = {
    email: user.email,
    userId: user.id,
    isPremiumTrial: user.isPremiumTrial,
    sessionToken: user.currentStreamSession,
  };
  const token = jwtService.sign(payload, { expiresIn: '1h' });

  const url = `https://ipgenz-backend.onrender.com/stream/live/${channel.id}?token=${token}&transcode=audio`;
  console.log(`Testing channel: ${channel.name} (${channel.id})`);
  console.log(`URL: ${url}`);

  console.log('Starting 60s stream download test...');
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      },
      timeout: 90000
    });

    console.log(`HTTP Status: ${response.status}`);
    const stream = response.data;
    let bytesReceived = 0;
    let startTime = Date.now();

    const checkInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${elapsed}s] Total downloaded: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
    }, 5000);

    stream.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
    });

    stream.on('end', () => {
      clearInterval(checkInterval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Stream ENDED after ${elapsed}s. Total: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
      prisma.$disconnect();
      process.exit(1);
    });

    stream.on('error', (err: any) => {
      clearInterval(checkInterval);
      console.error('Stream error:', err.message);
      prisma.$disconnect();
      process.exit(1);
    });

    setTimeout(() => {
      clearInterval(checkInterval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Success! Stream is still active after ${elapsed}s. Total: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
      stream.destroy();
      prisma.$disconnect();
      process.exit(0);
    }, 60000);

  } catch (err: any) {
    console.error('Connection failed:', err.message);
    prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
