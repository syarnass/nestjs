import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Holiday } from '@prisma/client';
import { parseDateOnly, todayDateOnly } from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { BulkCreateHolidaysDto } from './dto/bulk-create-holidays.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { WorkingDaysService } from './working-days.service';

export interface BulkCreateResult {
  created: number;
  /** Tanggal yang sudah terdaftar sebelumnya sehingga dilewati. */
  skipped: number;
}

/**
 * Setiap perubahan hari libur berjalan dalam transaksi bersama perhitungan
 * ulang cuti PENDING yang terdampak, sehingga jumlah harinya selalu akurat.
 */
@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workingDays: WorkingDaysService,
    private readonly config: ConfigService,
  ) {}

  findAll(year?: number): Promise<Holiday[]> {
    const targetYear =
      year ??
      todayDateOnly(
        this.config.getOrThrow<string>('APP_TIMEZONE'),
      ).getUTCFullYear();

    return this.prisma.holiday.findMany({
      where: {
        date: {
          gte: parseDateOnly(`${targetYear}-01-01`),
          lte: parseDateOnly(`${targetYear}-12-31`),
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  create(dto: CreateHolidayDto): Promise<Holiday> {
    const date = parseDateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      const holiday = await tx.holiday.create({
        data: { date, name: dto.name },
      });
      await this.workingDays.recalculatePendingLeaves([date], tx);
      return holiday;
    });
  }

  createMany({ holidays }: BulkCreateHolidaysDto): Promise<BulkCreateResult> {
    // Hilangkan tanggal ganda di payload; yang pertama dipakai.
    const unique = [...new Map(holidays.map((h) => [h.date, h])).values()].map(
      (h) => ({ date: parseDateOnly(h.date), name: h.name }),
    );

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.holiday.createMany({
        data: unique,
        skipDuplicates: true,
      });
      await this.workingDays.recalculatePendingLeaves(
        unique.map((h) => h.date),
        tx,
      );
      return { created: count, skipped: holidays.length - count };
    });
  }

  async update(id: number, dto: UpdateHolidayDto): Promise<Holiday> {
    const existing = await this.findOneOrThrow(id);
    const newDate = dto.date ? parseDateOnly(dto.date) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const holiday = await tx.holiday.update({
        where: { id },
        data: { name: dto.name, date: newDate },
      });
      if (newDate) {
        await this.workingDays.recalculatePendingLeaves(
          [existing.date, newDate],
          tx,
        );
      }
      return holiday;
    });
  }

  async remove(id: number): Promise<Holiday> {
    await this.findOneOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      const holiday = await tx.holiday.delete({ where: { id } });
      await this.workingDays.recalculatePendingLeaves([holiday.date], tx);
      return holiday;
    });
  }

  private async findOneOrThrow(id: number): Promise<Holiday> {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) {
      throw new NotFoundException(`Hari libur dengan id ${id} tidak ditemukan`);
    }
    return holiday;
  }
}
