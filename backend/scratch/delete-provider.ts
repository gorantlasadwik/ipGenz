import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Step 1: List all providers so we can confirm which one is buyplux
  const providers = await prisma.provider.findMany({
    select: {
      id: true,
      providerName: true,
      providerType: true,
      status: true,
      playlistUrl: true,
      serverUrl: true,
      username: true,
      createdAt: true,
    },
  });

  console.log('\n=== All Providers in DB ===');
  providers.forEach((p, i) => {
    console.log(`\n[${i + 1}] ID: ${p.id}`);
    console.log(`    Name:       ${p.providerName}`);
    console.log(`    Type:       ${p.providerType}`);
    console.log(`    Status:     ${p.status}`);
    console.log(`    Server URL: ${p.serverUrl}`);
    console.log(`    Username:   ${p.username}`);
    console.log(`    Playlist:   ${p.playlistUrl}`);
    console.log(`    Created:    ${p.createdAt}`);
  });

  // Step 2: Find the buyplux provider (case-insensitive)
  const buyplux = providers.find((p) =>
    p.providerName.toLowerCase().includes('buyplux'),
  );

  if (!buyplux) {
    console.log(
      '\n⚠️  No provider with "buyplux" in the name was found in the database.',
    );
    console.log(
      'Please check the provider names above and update the script if needed.',
    );
    await prisma.$disconnect();
    return;
  }

  console.log(`\n🎯 Found buyplux provider: "${buyplux.providerName}" (ID: ${buyplux.id})`);
  console.log('\n🗑️  Deleting provider and all its associated data (channels, categories, movies, series)...');

  // Step 3: Delete the provider — cascades to all related records
  const deleted = await prisma.provider.delete({
    where: { id: buyplux.id },
  });

  console.log(`\n✅ Successfully deleted provider: "${deleted.providerName}" (ID: ${deleted.id})`);
  console.log('   All associated LiveCategories, LiveChannels, Movies, Series, etc. have been removed.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
