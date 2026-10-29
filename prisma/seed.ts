import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@hr.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Administrator',
      email,
      password: await bcrypt.hash(password, saltRounds),
      role: Role.ADMIN,
    },
  });
  console.log(`Admin       : ${email} / ${password}`);
}

/** Data contoh untuk development: satu atasan dengan satu bawahan. */
async function seedSampleEmployees() {
  const password = 'Password123!';
  const hash = await bcrypt.hash(password, saltRounds);

  const manager = await prisma.user.upsert({
    where: { email: 'manager@hr.local' },
    update: {},
    create: {
      name: 'Siti Manager',
      email: 'manager@hr.local',
      password: hash,
      role: Role.MANAGER,
      employee: {
        create: {
          employeeNumber: 'EMP-0001',
          position: 'Engineering Manager',
          department: 'Engineering',
          joinDate: new Date('2022-01-03'),
        },
      },
    },
    select: { employee: { select: { id: true } } },
  });

  await prisma.user.upsert({
    where: { email: 'karyawan@hr.local' },
    update: {},
    create: {
      name: 'Budi Karyawan',
      email: 'karyawan@hr.local',
      password: hash,
      role: Role.EMPLOYEE,
      employee: {
        create: {
          employeeNumber: 'EMP-0002',
          position: 'Software Engineer',
          department: 'Engineering',
          joinDate: new Date('2024-02-01'),
          managerId: manager.employee!.id,
        },
      },
    },
  });

  console.log(`Atasan      : manager@hr.local / ${password}`);
  console.log(`Karyawan    : karyawan@hr.local / ${password}`);
}

async function main() {
  await seedAdmin();
  if (process.env.NODE_ENV !== 'production') await seedSampleEmployees();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
