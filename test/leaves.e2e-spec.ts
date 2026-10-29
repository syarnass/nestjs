import { INestApplication } from '@nestjs/common';
import { LeaveStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAs } from './utils/create-test-app';

/**
 * Alur HR lengkap: admin membuat atasan & karyawan, karyawan mengajukan cuti,
 * atasan menyetujui/menolak, saldo cuti berkurang hanya saat disetujui.
 * Membutuhkan database yang berjalan sesuai DATABASE_URL.
 */
describe('Employees & Leaves (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let otherManagerToken: string;
  let staffToken: string;
  let staffEmployeeId: number;

  const PASSWORD = 'Password123!';
  const EMAIL_DOMAIN = '@e2e-leave.local';
  const admin = `admin${EMAIL_DOMAIN}`;
  // Tahun depan supaya tanggal selalu di masa depan.
  const YEAR = new Date().getUTCFullYear() + 1;

  /** Senin pertama bulan tertentu tahun depan, + offset hari. */
  const mondayOf = (month: number, offsetDays = 0): string => {
    const d = new Date(Date.UTC(YEAR, month - 1, 1));
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  const http = () => request(app.getHttpServer());
  const cleanup = () =>
    prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });

  const createEmployee = (
    token: string,
    body: Record<string, unknown>,
    expected = 201,
  ) =>
    http()
      .post('/api/employees')
      .auth(token, { type: 'bearer' })
      .send({
        password: PASSWORD,
        position: 'Staff',
        department: 'E2E',
        joinDate: '2024-01-15',
        ...body,
      })
      .expect(expected);

  const submitLeave = (startDate: string, endDate: string, expected = 201) =>
    http()
      .post('/api/leave-requests')
      .auth(staffToken, { type: 'bearer' })
      .send({ startDate, endDate, reason: 'Keperluan keluarga' })
      .expect(expected);

  const balance = async () =>
    (
      await http()
        .get(`/api/leave-balances/me?year=${YEAR}`)
        .auth(staffToken, { type: 'bearer' })
        .expect(200)
    ).body;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanup();

    await prisma.user.create({
      data: {
        name: 'E2E Admin',
        email: admin,
        password: await bcrypt.hash(PASSWORD, 4),
        role: Role.ADMIN,
      },
    });
    adminToken = await loginAs(app, admin, PASSWORD);

    const { body: manager } = await createEmployee(adminToken, {
      name: 'Atasan',
      email: `manager${EMAIL_DOMAIN}`,
      role: Role.MANAGER,
      employeeNumber: 'E2E-MGR-1',
    });
    await createEmployee(adminToken, {
      name: 'Atasan Lain',
      email: `manager2${EMAIL_DOMAIN}`,
      role: Role.MANAGER,
      employeeNumber: 'E2E-MGR-2',
    });
    const { body: staff } = await createEmployee(adminToken, {
      name: 'Karyawan',
      email: `staff${EMAIL_DOMAIN}`,
      employeeNumber: 'E2E-STAFF-1',
      managerId: manager.id,
    });
    staffEmployeeId = staff.id;
    expect(staff.manager.id).toBe(manager.id);
    expect(staff.user).not.toHaveProperty('password');

    managerToken = await loginAs(app, `manager${EMAIL_DOMAIN}`, PASSWORD);
    otherManagerToken = await loginAs(app, `manager2${EMAIL_DOMAIN}`, PASSWORD);
    staffToken = await loginAs(app, `staff${EMAIL_DOMAIN}`, PASSWORD);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('Employees', () => {
    it('hanya ADMIN yang bisa membuat karyawan', () =>
      createEmployee(
        managerToken,
        { name: 'X', email: `x${EMAIL_DOMAIN}`, employeeNumber: 'E2E-X' },
        403,
      ));

    it('menolak atasan yang ber-role EMPLOYEE', () =>
      createEmployee(
        adminToken,
        {
          name: 'Y',
          email: `y${EMAIL_DOMAIN}`,
          employeeNumber: 'E2E-Y',
          managerId: staffEmployeeId,
        },
        400,
      ));

    it('menolak nomor karyawan yang duplikat', () =>
      createEmployee(
        adminToken,
        { name: 'Z', email: `z${EMAIL_DOMAIN}`, employeeNumber: 'E2E-STAFF-1' },
        409,
      ));

    it('karyawan bisa melihat profilnya sendiri', async () => {
      const { body } = await http()
        .get('/api/employees/me')
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
      expect(body).toMatchObject({ id: staffEmployeeId, department: 'E2E' });
    });

    it('atasan bisa melihat bawahannya', async () => {
      const { body } = await http()
        .get('/api/employees/me/subordinates')
        .auth(managerToken, { type: 'bearer' })
        .expect(200);
      expect(body.map((e: { id: number }) => e.id)).toEqual([staffEmployeeId]);
    });
  });

  describe('Leave requests', () => {
    it('saldo awal = jatah default (12 hari)', async () => {
      expect(await balance()).toMatchObject({
        quota: 12,
        used: 0,
        pending: 0,
        available: 12,
      });
    });

    it('approve memotong saldo; saldo tidak berubah saat masih PENDING', async () => {
      // Senin–Rabu = 3 hari kerja
      const { body: leave } = await submitLeave(mondayOf(3), mondayOf(3, 2));
      expect(leave).toMatchObject({ days: 3, status: LeaveStatus.PENDING });
      expect(await balance()).toMatchObject({ used: 0, pending: 3 });

      const { body: approvals } = await http()
        .get('/api/leave-requests/approvals?status=PENDING')
        .auth(managerToken, { type: 'bearer' })
        .expect(200);
      expect(approvals.data.map((l: { id: number }) => l.id)).toContain(
        leave.id,
      );

      // Atasan lain tidak berhak menyetujui.
      await http()
        .patch(`/api/leave-requests/${leave.id}/approve`)
        .auth(otherManagerToken, { type: 'bearer' })
        .send({})
        .expect(403);

      // Karyawan tidak bisa menyetujui pengajuannya sendiri.
      await http()
        .patch(`/api/leave-requests/${leave.id}/approve`)
        .auth(staffToken, { type: 'bearer' })
        .send({})
        .expect(403);

      const { body: approved } = await http()
        .patch(`/api/leave-requests/${leave.id}/approve`)
        .auth(managerToken, { type: 'bearer' })
        .send({ note: 'Selamat berlibur' })
        .expect(200);
      expect(approved).toMatchObject({
        status: LeaveStatus.APPROVED,
        decisionNote: 'Selamat berlibur',
      });
      expect(await balance()).toMatchObject({
        used: 3,
        pending: 0,
        remaining: 9,
      });

      // Tidak bisa diproses dua kali.
      await http()
        .patch(`/api/leave-requests/${leave.id}/reject`)
        .auth(managerToken, { type: 'bearer' })
        .send({ note: 'Berubah pikiran' })
        .expect(409);
    });

    it('reject tidak memotong saldo dan wajib menyertakan alasan', async () => {
      const { body: leave } = await submitLeave(mondayOf(4), mondayOf(4));

      await http()
        .patch(`/api/leave-requests/${leave.id}/reject`)
        .auth(managerToken, { type: 'bearer' })
        .send({})
        .expect(400);

      await http()
        .patch(`/api/leave-requests/${leave.id}/reject`)
        .auth(managerToken, { type: 'bearer' })
        .send({ note: 'Ada deadline' })
        .expect(200);
      expect(await balance()).toMatchObject({ used: 3, pending: 0 });
    });

    it('karyawan bisa membatalkan pengajuan PENDING', async () => {
      const { body: leave } = await submitLeave(mondayOf(10), mondayOf(10));
      const { body } = await http()
        .patch(`/api/leave-requests/${leave.id}/cancel`)
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
      expect(body.status).toBe(LeaveStatus.CANCELLED);
    });

    it('menghitung hari kerja saja (akhir pekan tidak dihitung)', async () => {
      // Jumat → Senin berikutnya = 2 hari kerja
      const { body } = await submitLeave(mondayOf(6, 4), mondayOf(6, 7));
      expect(body.days).toBe(2);
      await http()
        .patch(`/api/leave-requests/${body.id}/cancel`)
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
    });

    it('menolak tanggal yang bentrok dengan cuti aktif', () =>
      submitLeave(mondayOf(3, 1), mondayOf(3, 1), 409));

    it('menolak tanggal yang sudah lewat & format yang salah', async () => {
      await submitLeave('2020-01-06', '2020-01-06', 400);
      await submitLeave('06-01-2030', '2030-01-06', 400);
    });

    it('menolak pengajuan melebihi sisa cuti', async () => {
      // Sisa 9 hari; 2 minggu penuh = 10 hari kerja.
      const { body } = await submitLeave(mondayOf(7), mondayOf(7, 11), 400);
      expect(body.message).toContain('Sisa cuti tidak mencukupi');
    });

    it('approve paralel atas pengajuan yang sama hanya berhasil sekali', async () => {
      const { body: leave } = await submitLeave(mondayOf(8), mondayOf(8));

      const results = await Promise.all(
        [managerToken, adminToken].map((token) =>
          http()
            .patch(`/api/leave-requests/${leave.id}/approve`)
            .auth(token, { type: 'bearer' })
            .send({}),
        ),
      );

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await balance()).toMatchObject({ used: 4 });
    });

    it('approve dibatalkan jika saldo tidak cukup saat diproses', async () => {
      const { body: leave } = await submitLeave(mondayOf(9), mondayOf(9));

      // Admin menurunkan jatah setelah pengajuan dibuat: sisa jadi 0.
      await http()
        .put(`/api/leave-balances/employees/${staffEmployeeId}/${YEAR}`)
        .auth(adminToken, { type: 'bearer' })
        .send({ quota: 4 })
        .expect(200);

      await http()
        .patch(`/api/leave-requests/${leave.id}/approve`)
        .auth(managerToken, { type: 'bearer' })
        .send({})
        .expect(400);

      // Transaksi di-rollback: status tetap PENDING, saldo tidak berubah.
      const { body } = await http()
        .get(`/api/leave-requests/${leave.id}`)
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
      expect(body.status).toBe(LeaveStatus.PENDING);
      expect(await balance()).toMatchObject({ quota: 4, used: 4 });
    });

    it('jatah tidak bisa diturunkan di bawah yang sudah terpakai', () =>
      http()
        .put(`/api/leave-balances/employees/${staffEmployeeId}/${YEAR}`)
        .auth(adminToken, { type: 'bearer' })
        .send({ quota: 2 })
        .expect(400));

    it('atasan lain tidak bisa melihat detail cuti karyawan', async () => {
      const { body } = await http()
        .get('/api/leave-requests/me')
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
      expect(body.meta.total).toBeGreaterThan(0);

      await http()
        .get(`/api/leave-requests/${body.data[0].id}`)
        .auth(otherManagerToken, { type: 'bearer' })
        .expect(403);
    });
  });
});
