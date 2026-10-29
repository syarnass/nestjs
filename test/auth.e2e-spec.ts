import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';

/**
 * Membutuhkan database yang berjalan sesuai DATABASE_URL.
 * Test membuat user sendiri dan menghapusnya kembali setelah selesai.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const admin = { email: 'e2e-admin@hr.local', password: 'Admin123!e2e' };
  const employee = { email: 'e2e-employee@hr.local', password: 'Karyawan1!' };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanup();
    await prisma.user.create({
      data: {
        name: 'E2E Admin',
        email: admin.email,
        password: await bcrypt.hash(admin.password, 4),
        role: Role.ADMIN,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  const cleanup = () =>
    prisma.user.deleteMany({
      where: { email: { in: [admin.email, employee.email] } },
    });

  const login = (body: { email: string; password: string }) =>
    request(app.getHttpServer()).post('/api/auth/login').send(body);

  it('menolak akses tanpa token', () =>
    request(app.getHttpServer()).get('/api/auth/me').expect(401));

  it('menolak login dengan password salah', () =>
    login({ email: admin.email, password: 'SalahBanget1!' }).expect(401));

  it('alur lengkap: login → me → refresh → logout', async () => {
    const { body: tokens } = await login(admin).expect(200);
    expect(tokens).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    const { body: me } = await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(200);
    expect(me).toMatchObject({ email: admin.email, role: Role.ADMIN });
    expect(me).not.toHaveProperty('password');
    expect(me).not.toHaveProperty('refreshTokenHash');

    const { body: rotated } = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    // Refresh token lama tidak berlaku lagi setelah rotasi.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(rotated.accessToken, { type: 'bearer' })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });

  it('hanya ADMIN yang bisa mengelola user', async () => {
    const { body: adminTokens } = await login(admin).expect(200);

    const { body: created } = await request(app.getHttpServer())
      .post('/api/users')
      .auth(adminTokens.accessToken, { type: 'bearer' })
      .send({ name: 'Karyawan E2E', ...employee })
      .expect(201);
    expect(created).toMatchObject({ role: Role.EMPLOYEE });
    expect(created).not.toHaveProperty('password');

    await request(app.getHttpServer())
      .post('/api/users')
      .auth(adminTokens.accessToken, { type: 'bearer' })
      .send({ name: 'Duplikat', ...employee })
      .expect(409);

    const { body: employeeTokens } = await login(employee).expect(200);
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(employeeTokens.accessToken, { type: 'bearer' })
      .expect(403);
  });
});
