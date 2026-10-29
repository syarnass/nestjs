import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { LeaveBalancesController } from './leave-balances.controller';
import { LeaveBalancesService } from './leave-balances.service';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';

@Module({
  imports: [EmployeesModule, HolidaysModule],
  controllers: [LeaveRequestsController, LeaveBalancesController],
  providers: [LeaveRequestsService, LeaveBalancesService],
})
export class LeavesModule {}
