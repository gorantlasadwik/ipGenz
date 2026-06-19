import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function checkDb() {
  const prisma = new PrismaClient();
  try {
    const trials = await prisma.trialProvider.findMany();
    console.log('TRIAL_PROVIDERS:', JSON.stringify(trials, null, 2));
    console.log('COUNT:', trials.length);
  } catch (e: any) {
    console.error('DB ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDb();
