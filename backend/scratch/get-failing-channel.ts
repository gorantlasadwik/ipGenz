import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const channelId = 'e81646b9-e03f-4cfb-93e8-28bd5724c617';
  const channel = await prisma.liveChannel.findUnique({
    where: { id: channelId },
  });

  console.log('=== Failing Channel Details ===');
  if (channel) {
    console.log(`ID:         ${channel.id}`);
    console.log(`Name:       ${channel.name}`);
    console.log(`Stream URL: ${channel.streamUrl}`);
  } else {
    console.log(`Channel with ID ${channelId} not found in database.`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
