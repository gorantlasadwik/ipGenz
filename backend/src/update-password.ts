import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'gorantlasadwik@gmail.com';
  const plainPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const updated = await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  console.log(`Successfully updated password for ${email}. New plain password: ${plainPassword}`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
