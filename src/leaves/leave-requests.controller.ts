import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import {
  ApproveLeaveRequestDto,
  RejectLeaveRequestDto,
} from './dto/decide-leave-request.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import { LeaveRequestsService } from './leave-requests.service';

@ApiTags('Leave Requests')
@ApiBearerAuth()
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  /** Mengajukan cuti (status awal PENDING). */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveRequestsService.create(user.id, dto);
  }

  /** Riwayat pengajuan cuti milik sendiri. */
  @Get('me')
  findMine(
    @CurrentUser() user: AuthUser,
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveRequestsService.findMine(user.id, query);
  }

  /** Pengajuan yang bisa diproses: bawahan langsung (MANAGER) / semua (ADMIN). */
  @Roles(Role.MANAGER, Role.ADMIN)
  @Get('approvals')
  findForApproval(
    @CurrentUser() user: AuthUser,
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveRequestsService.findForApproval(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveRequestsService.findOne(user, id);
  }

  /** Menyetujui cuti; saldo cuti karyawan langsung berkurang. */
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch(':id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveLeaveRequestDto,
  ) {
    return this.leaveRequestsService.approve(user, id, dto);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectLeaveRequestDto,
  ) {
    return this.leaveRequestsService.reject(user, id, dto);
  }

  /** Membatalkan pengajuan sendiri yang masih PENDING. */
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.leaveRequestsService.cancel(user, id);
  }
}
