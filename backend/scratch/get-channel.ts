import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';

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

  const channel = await prisma.liveChannel.findFirst({
    where: { streamUrl: { contains: '.ts' } },
    include: { provider: true }
  }) || await prisma.liveChannel.findFirst();

  if (!channel) {
    console.error('No channels found in database');
    process.exit(1);
  }

  // Generate a valid JWT token
  const payload = {
    email: user.email,
    userId: user.id,
    isPremiumTrial: user.isPremiumTrial,
    sessionToken: user.currentStreamSession,
  };
  const token = jwtService.sign(payload, { expiresIn: '1h' });

  console.log('--- TEST DETAILS ---');
  console.log(`User Email: ${user.email}`);
  console.log(`Channel Name: ${channel.name}`);
  console.log(`Channel ID: ${channel.id}`);
  console.log(`IPTV Stream URL: ${channel.streamUrl}`);
  console.log(`JWT Token: ${token}`);
  console.log(`Direct stream URL: https://ipgenz-backend.onrender.com/stream/live/${channel.id}?token=${token}`);
  console.log(`Transcoded stream URL: https://ipgenz-backend.onrender.com/stream/live/${channel.id}?token=${token}&transcode=audio`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
