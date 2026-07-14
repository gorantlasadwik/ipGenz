import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking Provider Table ===');
  const providers = await prisma.provider.findMany();
  console.log(`Found ${providers.length} total providers.`);
  
  for (const p of providers) {
    const isBuxplay = 
      (p.providerName && p.providerName.toLowerCase().includes('buxplay')) ||
      (p.providerName && p.providerName.toLowerCase().includes('buyplux')) ||
      (p.serverUrl && p.serverUrl.toLowerCase().includes('buxplay')) ||
      (p.playlistUrl && p.playlistUrl.toLowerCase().includes('buxplay'));

    if (isBuxplay) {
      console.log(`🗑️ Deleting Provider: "${p.providerName}" (ID: ${p.id}, Server: ${p.serverUrl})`);
      await prisma.provider.delete({
        where: { id: p.id },
      });
      console.log('Deleted successfully.');
    } else {
      console.log(`Keeping Provider: "${p.providerName}" (ID: ${p.id})`);
    }
  }

  console.log('\n=== Checking TrialProvider Table ===');
  const trialProviders = await prisma.trialProvider.findMany();
  console.log(`Found ${trialProviders.length} total trial providers.`);

  for (const tp of trialProviders) {
    const isBuxplay = 
      (tp.providerName && tp.providerName.toLowerCase().includes('buxplay')) ||
      (tp.providerName && tp.providerName.toLowerCase().includes('buyplux')) ||
      (tp.serverUrl && tp.serverUrl.toLowerCase().includes('buxplay')) ||
      (tp.playlistUrl && tp.playlistUrl.toLowerCase().includes('buxplay'));

    if (isBuxplay) {
      console.log(`🗑️ Deleting TrialProvider: "${tp.providerName}" (ID: ${tp.id}, Server: ${tp.serverUrl})`);
      await prisma.trialProvider.delete({
        where: { id: tp.id },
      });
      console.log('Deleted successfully.');
    } else {
      console.log(`Keeping TrialProvider: "${tp.providerName}" (ID: ${tp.id})`);
    }
  }

  console.log('\n=== Done checking database. ===');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
