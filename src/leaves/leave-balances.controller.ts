import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { EmployeesService } from '../employees/employees.service';
import {
  LeaveBalanceQueryDto,
  SetLeaveQuotaDto,
} from './dto/leave-balance.dto';
import { LeaveBalancesService } from './leave-balances.service';

@ApiTags('Leave Balances')
@ApiBearerAuth()
@Controller('leave-balances')
export class LeaveBalancesController {
  constructor(
    private readonly balancesService: LeaveBalancesService,
    private readonly employeesService: EmployeesService,
  ) {}

  /** Saldo cuti milik sendiri. */
  @Get('me')
  async findMine(
    @CurrentUser() user: AuthUser,
    @Query() { year }: LeaveBalanceQueryDto,
  ) {
    const employee = await this.employeesService.findByUserId(user.id);
    return this.balancesService.getSummary(
      employee.id,
      year ?? this.balancesService.currentYear(),
    );
  }

  @Roles(Role.ADMIN)
  @Get('employees/:employeeId')
  async findByEmployee(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query() { year }: LeaveBalanceQueryDto,
  ) {
    await this.employeesService.findOne(employeeId);
    return this.balancesService.getSummary(
      employeeId,
      year ?? this.balancesService.currentYear(),
    );
  }

  /** Mengatur jatah cuti karyawan untuk tahun tertentu. */
  @Roles(Role.ADMIN)
  @Put('employees/:employeeId/:year')
  async setQuota(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: SetLeaveQuotaDto,
  ) {
    await this.employeesService.findOne(employeeId);
    return this.balancesService.setQuota(employeeId, year, dto.quota);
  }
}
