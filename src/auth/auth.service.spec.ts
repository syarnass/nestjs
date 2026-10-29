import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const config: Record<string, string> = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  JWT_REFRESH_EXPIRES_IN: '7d',
};

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let user: User;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
  const usersService = {
    findOne: jest.fn(),
    hashPassword: jest.fn((p: string) => bcrypt.hash(p, 4)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    user = {
      id: 1,
      name: 'Budi',
      email: 'budi@hr.local',
      password: await bcrypt.hash('Rahasia123!', 4),
      role: Role.EMPLOYEE,
      isActive: true,
      refreshTokenHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: string) => config[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
  });

  describe('login', () => {
    it('mengembalikan token dan menyimpan hash refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const tokens = await service.login({
        email: user.email,
        password: 'Rahasia123!',
      });

      const payload = jwt.verify(tokens.accessToken, {
        secret: config.JWT_ACCESS_SECRET,
      });
      expect(payload).toMatchObject({ sub: 1, role: Role.EMPLOYEE });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { refreshTokenHash: sha256(tokens.refreshToken) },
      });
    });

    it('menolak password yang salah', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'SalahBanget1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('menolak email yang tidak terdaftar dengan pesan yang sama', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'x@hr.local', password: 'Rahasia123!' }),
      ).rejects.toThrow('Email atau password salah');
    });

    it('menolak akun yang tidak aktif', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });

      await expect(
        service.login({ email: user.email, password: 'Rahasia123!' }),
      ).rejects.toThrow('Akun tidak aktif');
    });
  });

  describe('refresh', () => {
    const signRefresh = () =>
      jwt.sign(
        { sub: 1, email: user.email, role: user.role },
        { secret: config.JWT_REFRESH_SECRET },
      );

    it('menerbitkan token baru jika refresh token cocok', async () => {
      const token = signRefresh();
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        refreshTokenHash: sha256(token),
      });

      const tokens = await service.refresh(token);

      expect(tokens.accessToken).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('menolak refresh token yang sudah dirotasi / logout', async () => {
      const token = signRefresh();
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        refreshTokenHash: sha256('token-lain'),
      });

      await expect(service.refresh(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('menolak access token yang dipakai sebagai refresh token', async () => {
      const accessToken = jwt.sign(
        { sub: 1 },
        { secret: config.JWT_ACCESS_SECRET },
      );

      await expect(service.refresh(accessToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('menolak jika password saat ini salah', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(user);

      await expect(
        service.changePassword(1, {
          currentPassword: 'Salah123!',
          newPassword: 'BaruBanget1!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('mengganti password dan mengakhiri sesi', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(user);

      await service.changePassword(1, {
        currentPassword: 'Rahasia123!',
        newPassword: 'BaruBanget1!',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { password: expect.any(String), refreshTokenHash: null },
      });
    });
  });
});
