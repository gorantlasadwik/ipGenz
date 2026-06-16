import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('--- USERS ---');
  console.log(JSON.stringify(users, null, 2));

  const profiles = await prisma.profile.findMany();
  console.log('--- PROFILES ---');
  console.log(JSON.stringify(profiles, null, 2));

  const providers = await prisma.provider.findMany();
  console.log('--- PROVIDERS ---');
  console.log(JSON.stringify(providers, null, 2));

  const channels = await prisma.liveChannel.findMany({ take: 3 });
  console.log('--- CHANNELS ---');
  console.log(JSON.stringify(channels, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
