import { INestApplication } from '@nestjs/common';
import { LeaveStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAs } from './utils/create-test-app';

/**
 * Hari libur tidak dihitung sebagai hari cuti, dan cuti PENDING dihitung
 * ulang otomatis ketika data hari libur berubah.
 * Membutuhkan database yang berjalan sesuai DATABASE_URL.
 */
describe('Holidays (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;

  const PASSWORD = 'Password123!';
  const EMAIL_DOMAIN = '@e2e-holiday.local';
  const NAME_PREFIX = 'E2E ';
  // Dua tahun ke depan agar tidak bentrok dengan test cuti lain.
  const YEAR = new Date().getUTCFullYear() + 2;

  /** Senin pertama bulan tertentu, + offset hari. */
  const mondayOf = (month: number, offsetDays = 0): string => {
    const d = new Date(Date.UTC(YEAR, month - 1, 1));
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  const http = () => request(app.getHttpServer());
  const cleanup = async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.holiday.deleteMany({
      where: { name: { startsWith: NAME_PREFIX } },
    });
  };

  const addHoliday = (date: string, expected = 201) =>
    http()
      .post('/api/holidays')
      .auth(adminToken, { type: 'bearer' })
      .send({ date, name: `${NAME_PREFIX}Libur ${date}` })
      .expect(expected);

  const submitLeave = (startDate: string, endDate: string, expected = 201) =>
    http()
      .post('/api/leave-requests')
      .auth(staffToken, { type: 'bearer' })
      .send({ startDate, endDate, reason: 'Liburan' })
      .expect(expected);

  const getLeave = async (id: number) =>
    (
      await http()
        .get(`/api/leave-requests/${id}`)
        .auth(staffToken, { type: 'bearer' })
        .expect(200)
    ).body;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanup();

    const hash = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({
      data: {
        name: 'Admin',
        email: `admin${EMAIL_DOMAIN}`,
        password: hash,
        role: Role.ADMIN,
      },
    });
    const manager = await prisma.user.create({
      data: {
        name: 'Atasan',
        email: `manager${EMAIL_DOMAIN}`,
        password: hash,
        role: Role.MANAGER,
        employee: {
          create: {
            employeeNumber: 'E2E-HOL-MGR',
            position: 'Manager',
            department: 'E2E',
            joinDate: new Date('2024-01-01'),
          },
        },
      },
      select: { employee: { select: { id: true } } },
    });
    await prisma.user.create({
      data: {
        name: 'Karyawan',
        email: `staff${EMAIL_DOMAIN}`,
        password: hash,
        employee: {
          create: {
            employeeNumber: 'E2E-HOL-STAFF',
            position: 'Staff',
            department: 'E2E',
            joinDate: new Date('2024-01-01'),
            managerId: manager.employee!.id,
          },
        },
      },
    });

    adminToken = await loginAs(app, `admin${EMAIL_DOMAIN}`, PASSWORD);
    managerToken = await loginAs(app, `manager${EMAIL_DOMAIN}`, PASSWORD);
    staffToken = await loginAs(app, `staff${EMAIL_DOMAIN}`, PASSWORD);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('hanya ADMIN yang bisa menambah hari libur', () =>
    http()
      .post('/api/holidays')
      .auth(staffToken, { type: 'bearer' })
      .send({ date: mondayOf(3), name: `${NAME_PREFIX}X` })
      .expect(403));

  it('menolak tanggal hari libur yang duplikat', async () => {
    await addHoliday(mondayOf(2));
    await addHoliday(mondayOf(2), 409);
  });

  it('semua user bisa melihat daftar hari libur per tahun', async () => {
    const { body } = await http()
      .get(`/api/holidays?year=${YEAR}`)
      .auth(staffToken, { type: 'bearer' })
      .expect(200);
    expect(body.map((h: { date: string }) => h.date.slice(0, 10))).toContain(
      mondayOf(2),
    );
  });

  it('hari libur tidak dihitung sebagai hari cuti', async () => {
    await addHoliday(mondayOf(3, 2)); // Rabu
    // Senin–Jumat dengan 1 hari libur = 4 hari
    const { body } = await submitLeave(mondayOf(3), mondayOf(3, 4));
    expect(body.days).toBe(4);
  });

  it('menolak cuti yang seluruh tanggalnya hari libur', async () => {
    const { body } = await submitLeave(mondayOf(2), mondayOf(2), 400);
    expect(body.message).toContain('hari libur');
  });

  it('cuti PENDING dihitung ulang saat hari libur ditambah & dihapus', async () => {
    const { body: leave } = await submitLeave(mondayOf(4), mondayOf(4, 4));
    expect(leave.days).toBe(5);

    const { body: holiday } = await addHoliday(mondayOf(4, 1));
    expect((await getLeave(leave.id)).days).toBe(4);

    await http()
      .delete(`/api/holidays/${holiday.id}`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect((await getLeave(leave.id)).days).toBe(5);
  });

  it('memindahkan tanggal hari libur ikut menghitung ulang cuti', async () => {
    const { body: leave } = await submitLeave(mondayOf(5), mondayOf(5, 1));
    expect(leave.days).toBe(2);

    // Hari libur di luar rentang cuti → dipindah ke dalam rentang.
    const { body: holiday } = await addHoliday(mondayOf(5, 14));
    await http()
      .patch(`/api/holidays/${holiday.id}`)
      .auth(adminToken, { type: 'bearer' })
      .send({ date: mondayOf(5, 1) })
      .expect(200);
    expect((await getLeave(leave.id)).days).toBe(1);
  });

  it('cuti yang sudah APPROVED tidak berubah', async () => {
    const { body: leave } = await submitLeave(mondayOf(7), mondayOf(7, 1));
    await http()
      .patch(`/api/leave-requests/${leave.id}/approve`)
      .auth(managerToken, { type: 'bearer' })
      .send({})
      .expect(200);

    await addHoliday(mondayOf(7));
    const updated = await getLeave(leave.id);
    expect(updated).toMatchObject({ status: LeaveStatus.APPROVED, days: 2 });
  });

  it('bulk import melewati tanggal yang sudah ada', async () => {
    const { body } = await http()
      .post('/api/holidays/bulk')
      .auth(adminToken, { type: 'bearer' })
      .send({
        holidays: [
          { date: mondayOf(2), name: `${NAME_PREFIX}Sudah ada` },
          { date: mondayOf(9), name: `${NAME_PREFIX}Baru 1` },
          { date: mondayOf(9, 1), name: `${NAME_PREFIX}Baru 2` },
        ],
      })
      .expect(201);
    expect(body).toEqual({ created: 2, skipped: 1 });
  });

  it('bulk import memvalidasi setiap item', () =>
    http()
      .post('/api/holidays/bulk')
      .auth(adminToken, { type: 'bearer' })
      .send({ holidays: [{ date: '17-08-2030', name: '' }] })
      .expect(400));
});
