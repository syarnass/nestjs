import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BulkCreateHolidaysDto } from './dto/bulk-create-holidays.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidaysService } from './holidays.service';

@ApiTags('Holidays')
@ApiBearerAuth()
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  /** Daftar hari libur dalam satu tahun (semua user yang login). */
  @Get()
  findAll(@Query() { year }: HolidayQueryDto) {
    return this.holidaysService.findAll(year);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateHolidayDto) {
    return this.holidaysService.create(dto);
  }

  /** Import banyak hari libur; tanggal yang sudah ada dilewati. */
  @Roles(Role.ADMIN)
  @Post('bulk')
  createMany(@Body() dto: BulkCreateHolidaysDto) {
    return this.holidaysService.createMany(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHolidayDto) {
    return this.holidaysService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.holidaysService.remove(id);
  }
}
