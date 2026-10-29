import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@hr.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Administrator',
      email,
      password: await bcrypt.hash(password, saltRounds),
      role: Role.ADMIN,
    },
  });

  console.log(`Seeded admin: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
