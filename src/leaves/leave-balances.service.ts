import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeaveBalance, LeaveStatus, Prisma } from '@prisma/client';
import { parseDateOnly, todayDateOnly } from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaveBalanceSummary {
  employeeId: number;
  year: number;
  quota: number;
  /** Hari cuti yang sudah disetujui. */
  used: number;
  /** Hari cuti yang masih menunggu persetujuan. */
  pending: number;
  /** quota - used */
  remaining: number;
  /** remaining - pending: yang masih bisa diajukan. */
  available: number;
}

@Injectable()
export class LeaveBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  currentYear(): number {
    return todayDateOnly(
      this.config.getOrThrow<string>('APP_TIMEZONE'),
    ).getUTCFullYear();
  }

  /** Saldo dibuat otomatis dengan jatah default saat pertama kali dibutuhkan. */
  getOrCreate(
    employeeId: number,
    year: number,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<LeaveBalance> {
    return db.leaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      update: {},
      create: {
        employeeId,
        year,
        quota: this.config.getOrThrow<number>('LEAVE_DEFAULT_QUOTA'),
      },
    });
  }

  async getSummary(
    employeeId: number,
    year: number,
  ): Promise<LeaveBalanceSummary> {
    const [balance, pending] = await Promise.all([
      this.getOrCreate(employeeId, year),
      this.prisma.leaveRequest.aggregate({
        where: {
          employeeId,
          status: LeaveStatus.PENDING,
          startDate: {
            gte: parseDateOnly(`${year}-01-01`),
            lte: parseDateOnly(`${year}-12-31`),
          },
        },
        _sum: { days: true },
      }),
    ]);

    const pendingDays = pending._sum.days ?? 0;
    const remaining = balance.quota - balance.used;
    return {
      employeeId,
      year,
      quota: balance.quota,
      used: balance.used,
      pending: pendingDays,
      remaining,
      available: remaining - pendingDays,
    };
  }

  async setQuota(
    employeeId: number,
    year: number,
    quota: number,
  ): Promise<LeaveBalanceSummary> {
    const balance = await this.getOrCreate(employeeId, year);
    if (quota < balance.used) {
      throw new BadRequestException(
        `Jatah tidak boleh lebih kecil dari cuti yang sudah dipakai (${balance.used} hari)`,
      );
    }
    await this.prisma.leaveBalance.update({
      where: { id: balance.id },
      data: { quota },
    });
    return this.getSummary(employeeId, year);
  }
}
