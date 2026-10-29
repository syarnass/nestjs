import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { paginate, Paginated } from '../common/dto/pagination-query.dto';
import { parseDateOnly } from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { employeeSelect, EmployeeView } from './employees.select';

const MANAGER_ROLES: Role[] = [Role.MANAGER, Role.ADMIN];

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateEmployeeDto): Promise<EmployeeView> {
    const { name, email, password, role, managerId, joinDate, ...profile } =
      dto;
    if (managerId !== undefined) await this.assertValidManager(managerId);

    // Nested create: user & employee dibuat dalam satu transaksi.
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        role: role ?? Role.EMPLOYEE,
        password: await this.usersService.hashPassword(password),
        employee: {
          create: {
            ...profile,
            joinDate: parseDateOnly(joinDate),
            managerId,
          },
        },
      },
      select: { employee: { select: employeeSelect } },
    });
    return user.employee!;
  }

  async findAll(query: EmployeeQueryDto): Promise<Paginated<EmployeeView>> {
    const where: Prisma.EmployeeWhereInput = {
      department: query.department,
      ...(query.search && {
        OR: [
          { employeeNumber: { contains: query.search } },
          { user: { name: { contains: query.search } } },
          { user: { email: { contains: query.search } } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: employeeSelect,
        orderBy: { id: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async findOne(id: number): Promise<EmployeeView> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: employeeSelect,
    });
    if (!employee) {
      throw new NotFoundException(`Karyawan dengan id ${id} tidak ditemukan`);
    }
    return employee;
  }

  /** Data karyawan milik user yang sedang login. */
  async findByUserId(userId: number): Promise<EmployeeView> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: employeeSelect,
    });
    if (!employee) {
      throw new NotFoundException('Akun Anda belum terdaftar sebagai karyawan');
    }
    return employee;
  }

  async findSubordinates(userId: number): Promise<EmployeeView[]> {
    const manager = await this.findByUserId(userId);
    return this.prisma.employee.findMany({
      where: { managerId: manager.id },
      select: employeeSelect,
      orderBy: { id: 'asc' },
    });
  }

  async update(id: number, dto: UpdateEmployeeDto): Promise<EmployeeView> {
    await this.findOne(id);
    const { joinDate, managerId, ...profile } = dto;
    if (managerId != null) await this.assertValidManager(managerId, id);

    return this.prisma.employee.update({
      where: { id },
      data: {
        ...profile,
        ...(joinDate && { joinDate: parseDateOnly(joinDate) }),
        managerId,
      },
      select: employeeSelect,
    });
  }

  /**
   * Atasan harus ber-role MANAGER/ADMIN, bukan dirinya sendiri, dan tidak
   * boleh membentuk siklus (A atasan B, B atasan A).
   */
  private async assertValidManager(
    managerId: number,
    employeeId?: number,
  ): Promise<void> {
    const manager = await this.prisma.employee.findUnique({
      where: { id: managerId },
      select: { user: { select: { role: true } } },
    });
    if (!manager) {
      throw new BadRequestException(`Atasan dengan id ${managerId} tidak ada`);
    }
    if (!MANAGER_ROLES.includes(manager.user.role)) {
      throw new BadRequestException('Atasan harus memiliki role MANAGER');
    }
    if (employeeId === undefined) return;

    // Telusuri rantai atasan ke atas; jika bertemu karyawan ini → siklus.
    let currentId: number | null = managerId;
    const visited = new Set<number>();
    while (currentId !== null && !visited.has(currentId)) {
      if (currentId === employeeId) {
        throw new BadRequestException(
          'Atasan tidak valid: membentuk hierarki melingkar',
        );
      }
      visited.add(currentId);
      const current: { managerId: number | null } | null =
        await this.prisma.employee.findUnique({
          where: { id: currentId },
          select: { managerId: true },
        });
      currentId = current?.managerId ?? null;
    }
  }
}
