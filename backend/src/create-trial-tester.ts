import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const email = 'trial_tester@ipgenz.com';
  
  // Generate random 15-digit credentials
  const trialUsername = Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
  const trialPassword = Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
  const trialExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiry

  // Upsert user
  const existingUser = await prisma.user.findUnique({ where: { email } });

  let user;
  if (existingUser) {
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        isPremiumTrial: true,
        trialUsername,
        trialPassword,
        trialExpiry,
        assignedIp: null,
        currentStreamSession: null,
        lastDownloadAt: null,
        downloadsToday: 0,
      } as any,
    });
    console.log(`Updated existing user: ${email}`);
  } else {
    user = await prisma.user.create({
      data: {
        email,
        isPremiumTrial: true,
        trialUsername,
        trialPassword,
        trialExpiry,
        downloadsToday: 0,
      } as any,
    });
    console.log(`Created new user: ${email}`);

    // Create a default profile
    await prisma.profile.create({
      data: {
        userId: user.id,
        name: 'Trial Tester Profile',
      },
    });
    console.log('Created default profile for the trial user.');
  }

  console.log('\n--- TRIAL USER CREDENTIALS ---');
  console.log(`Email: ${email}`);
  console.log(`Username: ${trialUsername}`);
  console.log(`Password: ${trialPassword}`);
  console.log(`Expiry: ${trialExpiry.toISOString()}`);
  console.log('-------------------------------\n');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
