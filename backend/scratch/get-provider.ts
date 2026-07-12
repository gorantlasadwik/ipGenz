import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Let's print the model keys of prisma to see what provider models exist
  const keys = Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'));
  console.log('Models available in Prisma:', keys);
  
  // Try to find the provider table name (which is likely 'provider' or 'iptvProvider')
  const providerKey = keys.find(k => k.toLowerCase().includes('provider'));
  if (providerKey) {
    const providers = await (prisma as any)[providerKey].findMany();
    console.log('--- IPTV Providers ---');
    console.log(providers);
  }
  await prisma.$disconnect();
}

main().catch(console.error);
