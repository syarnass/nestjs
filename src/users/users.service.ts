import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PublicUser, publicUserSelect } from './users.select';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateUserDto): Promise<PublicUser> {
    return this.prisma.user.create({
      data: { ...dto, password: await this.hashPassword(dto.password) },
      select: publicUserSelect,
    });
  }

  findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) {
      throw new NotFoundException(`User dengan id ${id} tidak ditemukan`);
    }
    return user;
  }

  async update(id: number, dto: UpdateUserDto): Promise<PublicUser> {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      // Menonaktifkan user sekaligus mengakhiri sesinya.
      data: dto.isActive === false ? { ...dto, refreshTokenHash: null } : dto,
      select: publicUserSelect,
    });
  }

  async remove(id: number): Promise<PublicUser> {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id }, select: publicUserSelect });
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(
      password,
      this.config.getOrThrow<number>('BCRYPT_SALT_ROUNDS'),
    );
  }
}
