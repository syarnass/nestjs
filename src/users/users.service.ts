import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({ data: dto });
    } catch (e) {
      this.handleError(e);
    }
  }

  findAll() {
    return this.prisma.user.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User dengan id ${id} tidak ditemukan`);
    }
    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id);
    try {
      return await this.prisma.user.update({ where: { id }, data: dto });
    } catch (e) {
      this.handleError(e);
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id } });
  }

  private handleError(e: unknown): never {
    // P2002 = unique constraint violation (email sudah dipakai)
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      throw new ConflictException('Email sudah terdaftar');
    }
    throw e;
  }
}
