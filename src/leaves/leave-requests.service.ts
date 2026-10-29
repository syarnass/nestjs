import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeaveStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { paginate, Paginated } from '../common/dto/pagination-query.dto';
import {
  countWorkingDays,
  parseDateOnly,
  todayDateOnly,
} from '../common/utils/date.util';
import { EmployeesService } from '../employees/employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import {
  ApproveLeaveRequestDto,
  RejectLeaveRequestDto,
} from './dto/decide-leave-request.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { LeaveBalancesService } from './leave-balances.service';
import { leaveRequestSelect, LeaveRequestView } from './leave-requests.select';

const ACTIVE_STATUSES: LeaveStatus[] = [
  LeaveStatus.PENDING,
  LeaveStatus.APPROVED,
];

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeesService: EmployeesService,
    private readonly balancesService: LeaveBalancesService,
    private readonly config: ConfigService,
  ) {}

  async create(
    userId: number,
    dto: CreateLeaveRequestDto,
  ): Promise<LeaveRequestView> {
    const employee = await this.employeesService.findByUserId(userId);
    const startDate = parseDateOnly(dto.startDate);
    const endDate = parseDateOnly(dto.endDate);

    if (endDate < startDate) {
      throw new BadRequestException('endDate tidak boleh sebelum startDate');
    }
    if (
      startDate < todayDateOnly(this.config.getOrThrow<string>('APP_TIMEZONE'))
    ) {
      throw new BadRequestException('Tanggal mulai cuti sudah lewat');
    }
    // Saldo cuti dihitung per tahun, jadi satu pengajuan tidak boleh lintas tahun.
    const year = startDate.getUTCFullYear();
    if (endDate.getUTCFullYear() !== year) {
      throw new BadRequestException(
        'Pengajuan lintas tahun harus dipecah per tahun',
      );
    }

    const days = countWorkingDays(startDate, endDate);
    if (days === 0) {
      throw new BadRequestException(
        'Rentang tanggal tidak mengandung hari kerja',
      );
    }

    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: ACTIVE_STATUSES },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true },
    });
    if (overlapping) {
      throw new ConflictException(
        `Tanggal bentrok dengan pengajuan cuti #${overlapping.id}`,
      );
    }

    const balance = await this.balancesService.getSummary(employee.id, year);
    if (days > balance.available) {
      throw new BadRequestException(
        `Sisa cuti tidak mencukupi: butuh ${days} hari, tersedia ${balance.available} hari`,
      );
    }

    return this.prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        startDate,
        endDate,
        days,
        reason: dto.reason,
      },
      select: leaveRequestSelect,
    });
  }

  async findMine(
    userId: number,
    query: LeaveRequestQueryDto,
  ): Promise<Paginated<LeaveRequestView>> {
    const employee = await this.employeesService.findByUserId(userId);
    return this.findMany({ employeeId: employee.id }, query);
  }

  /** ADMIN melihat semua; MANAGER hanya pengajuan bawahan langsungnya. */
  async findForApproval(
    user: AuthUser,
    query: LeaveRequestQueryDto,
  ): Promise<Paginated<LeaveRequestView>> {
    if (user.role === Role.ADMIN) return this.findMany({}, query);

    const manager = await this.employeesService.findByUserId(user.id);
    return this.findMany({ employee: { managerId: manager.id } }, query);
  }

  async findOne(user: AuthUser, id: number): Promise<LeaveRequestView> {
    const request = await this.getOrThrow(id);
    const isOwner = request.employee.user.id === user.id;
    if (!isOwner && !(await this.canDecide(user, request))) {
      throw new ForbiddenException(
        'Anda tidak memiliki akses ke pengajuan ini',
      );
    }
    return request;
  }

  /**
   * Menyetujui cuti dan memotong saldo dalam satu transaksi:
   * - status hanya berubah jika masih PENDING (aman dari approve ganda), dan
   * - transaksi dibatalkan jika saldo menjadi minus.
   */
  async approve(
    user: AuthUser,
    id: number,
    dto: ApproveLeaveRequestDto,
  ): Promise<LeaveRequestView> {
    const request = await this.getDecidableOrThrow(user, id);
    const year = request.startDate.getUTCFullYear();
    const employeeId = request.employee.id;

    return this.prisma.$transaction(async (tx) => {
      await this.markDecided(tx, id, {
        status: LeaveStatus.APPROVED,
        approverId: user.id,
        decisionNote: dto.note,
      });

      await this.balancesService.getOrCreate(employeeId, year, tx);
      // UPDATE ... SET used = used + days mengunci baris saldo sampai commit,
      // sehingga approval paralel untuk karyawan yang sama berjalan berurutan.
      const balance = await tx.leaveBalance.update({
        where: { employeeId_year: { employeeId, year } },
        data: { used: { increment: request.days } },
      });
      if (balance.used > balance.quota) {
        throw new BadRequestException(
          `Sisa cuti karyawan tidak mencukupi (sisa ${
            balance.quota - balance.used + request.days
          } hari, diajukan ${request.days} hari)`,
        );
      }

      return tx.leaveRequest.findUniqueOrThrow({
        where: { id },
        select: leaveRequestSelect,
      });
    });
  }

  async reject(
    user: AuthUser,
    id: number,
    dto: RejectLeaveRequestDto,
  ): Promise<LeaveRequestView> {
    await this.getDecidableOrThrow(user, id);
    await this.markDecided(this.prisma, id, {
      status: LeaveStatus.REJECTED,
      approverId: user.id,
      decisionNote: dto.note,
    });
    return this.getOrThrow(id);
  }

  /** Karyawan membatalkan pengajuannya sendiri selama masih PENDING. */
  async cancel(user: AuthUser, id: number): Promise<LeaveRequestView> {
    const request = await this.getOrThrow(id);
    if (request.employee.user.id !== user.id) {
      throw new ForbiddenException('Hanya pemilik yang bisa membatalkan');
    }
    await this.markDecided(this.prisma, id, {
      status: LeaveStatus.CANCELLED,
    });
    return this.getOrThrow(id);
  }

  private async findMany(
    where: Prisma.LeaveRequestWhereInput,
    query: LeaveRequestQueryDto,
  ): Promise<Paginated<LeaveRequestView>> {
    const filter: Prisma.LeaveRequestWhereInput = {
      ...where,
      status: query.status,
      ...(query.year && {
        startDate: {
          gte: parseDateOnly(`${query.year}-01-01`),
          lte: parseDateOnly(`${query.year}-12-31`),
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where: filter,
        select: leaveRequestSelect,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.leaveRequest.count({ where: filter }),
    ]);
    return paginate(data, total, query);
  }

  private async getOrThrow(id: number): Promise<LeaveRequestView> {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id },
      select: leaveRequestSelect,
    });
    if (!request) {
      throw new NotFoundException(`Pengajuan cuti #${id} tidak ditemukan`);
    }
    return request;
  }

  private async getDecidableOrThrow(
    user: AuthUser,
    id: number,
  ): Promise<LeaveRequestView> {
    const request = await this.getOrThrow(id);
    if (request.employee.user.id === user.id) {
      throw new ForbiddenException('Tidak bisa memproses pengajuan sendiri');
    }
    if (!(await this.canDecide(user, request))) {
      throw new ForbiddenException(
        'Hanya atasan langsung atau ADMIN yang bisa memproses pengajuan ini',
      );
    }
    return request;
  }

  private async canDecide(
    user: AuthUser,
    request: LeaveRequestView,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) return true;
    if (user.role !== Role.MANAGER || request.employee.managerId === null) {
      return false;
    }
    const manager = await this.prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return manager?.id === request.employee.managerId;
  }

  /** Mengubah status hanya jika masih PENDING; selain itu → 409. */
  private async markDecided(
    db: Prisma.TransactionClient,
    id: number,
    data: {
      status: LeaveStatus;
      approverId?: number;
      decisionNote?: string;
    },
  ): Promise<void> {
    const { count } = await db.leaveRequest.updateMany({
      where: { id, status: LeaveStatus.PENDING },
      data: { ...data, decidedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException('Pengajuan cuti ini sudah diproses');
    }
  }
}
