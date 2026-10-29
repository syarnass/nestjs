import { Injectable } from '@nestjs/common';
import { LeaveStatus, Prisma } from '@prisma/client';
import { countWorkingDays, formatDateOnly } from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';

/** Menghitung hari kerja dengan memperhitungkan akhir pekan & hari libur. */
@Injectable()
export class WorkingDaysService {
  constructor(private readonly prisma: PrismaService) {}

  async count(
    start: Date,
    end: Date,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const holidays = await db.holiday.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true },
    });
    return countWorkingDays(
      start,
      end,
      new Set(holidays.map((h) => formatDateOnly(h.date))),
    );
  }

  /**
   * Menghitung ulang jumlah hari cuti PENDING yang mencakup tanggal-tanggal
   * tertentu, dipanggil setelah data hari libur berubah. Cuti yang sudah
   * diproses (APPROVED, dsb.) sengaja tidak diubah agar saldo historis tetap.
   */
  async recalculatePendingLeaves(
    dates: Date[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (dates.length === 0) return;

    const affected = await db.leaveRequest.findMany({
      where: {
        status: LeaveStatus.PENDING,
        OR: dates.map((date) => ({
          startDate: { lte: date },
          endDate: { gte: date },
        })),
      },
      select: { id: true, startDate: true, endDate: true, days: true },
    });

    for (const leave of affected) {
      const days = await this.count(leave.startDate, leave.endDate, db);
      if (days !== leave.days) {
        await db.leaveRequest.update({
          where: { id: leave.id },
          data: { days },
        });
      }
    }
  }
}
