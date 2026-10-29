import { Module } from '@nestjs/common';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { WorkingDaysService } from './working-days.service';

@Module({
  controllers: [HolidaysController],
  providers: [HolidaysService, WorkingDaysService],
  exports: [WorkingDaysService],
})
export class HolidaysModule {}
