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
    console.error('No users found');
    process.exit(1);
  }

  const channel = await prisma.liveChannel.findUnique({
    where: { id: '261c910c-e29d-443d-ae6d-8238bdd4bc43' }
  });

  if (!channel) {
    console.error('Star Maa channel not found');
    process.exit(1);
  }

  const payload = {
    email: user.email,
    userId: user.id,
    isPremiumTrial: user.isPremiumTrial,
    sessionToken: user.currentStreamSession,
  };
  const token = jwtService.sign(payload, { expiresIn: '1h' });

  // Query local backend with ?transcode=audio
  const url = `http://localhost:3001/stream/live/${channel.id}?token=${token}&transcode=audio`;
  console.log(`Testing transcoded proxy duration locally (Residential IP): ${url}`);

  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 90000 // 90s
    });

    console.log(`HTTP Status: ${response.status}`);
    const stream = response.data;
    let bytesReceived = 0;
    let startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${elapsed}s] Transcoded Data: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
    }, 5000);

    stream.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
    });

    stream.on('end', () => {
      clearInterval(interval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Local transcoded stream ended after ${elapsed}s. Total: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
      prisma.$disconnect();
      process.exit(1);
    });

    stream.on('error', (err: any) => {
      clearInterval(interval);
      console.error('Local transcoded stream error:', err.message);
      prisma.$disconnect();
      process.exit(1);
    });

    // Let it run for 60 seconds
    setTimeout(() => {
      clearInterval(interval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Success! Local transcoded stream is still running after ${elapsed}s. Total: ${(bytesReceived / 1024 / 1024).toFixed(2)} MB`);
      stream.destroy();
      prisma.$disconnect();
      process.exit(0);
    }, 60000);

  } catch (err: any) {
    console.error('Local connection failed:', err.message);
    prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
