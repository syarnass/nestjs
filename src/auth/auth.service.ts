import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PublicUser } from '../users/users.select';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { AuthTokens } from './interfaces/auth-tokens.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const INVALID_CREDENTIALS = 'Email atau password salah';
const INVALID_REFRESH_TOKEN = 'Refresh token tidak valid atau kedaluwarsa';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login({ email, password }: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Pesan error sengaja disamakan agar tidak membocorkan email mana yang terdaftar.
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (
      !user?.isActive ||
      !user.refreshTokenHash ||
      !this.isSameHash(user.refreshTokenHash, this.hashToken(refreshToken))
    ) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    // Rotasi: refresh token lama otomatis tidak berlaku lagi.
    return this.issueTokens(user);
  }

  async logout(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  getProfile(userId: number): Promise<PublicUser> {
    return this.usersService.findOne(userId);
  }

  async changePassword(
    userId: number,
    { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('Password saat ini salah');
    }

    // Mengganti password juga mengakhiri sesi yang sedang berjalan.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await this.usersService.hashPassword(newPassword),
        refreshTokenHash: null,
      },
    });
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
      }),
      // `jti` unik memastikan setiap refresh token berbeda, walaupun
      // diterbitkan untuk user yang sama di detik yang sama.
      this.jwtService.signAsync(payload, {
        jwtid: randomUUID(),
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.hashToken(refreshToken) },
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }
  }

  // SHA-256, bukan bcrypt: bcrypt hanya membaca 72 byte pertama, sedangkan
  // JWT lebih panjang dari itu sehingga token berbeda bisa dianggap sama.
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isSameHash(a: string, b: string): boolean {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
