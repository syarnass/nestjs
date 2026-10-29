import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class LeaveBalanceQueryDto {
  /** Default: tahun berjalan. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class SetLeaveQuotaDto {
  /** Jatah cuti dalam hari kerja. @example 12 */
  @IsInt()
  @Min(0)
  @Max(365)
  quota: number;
}
