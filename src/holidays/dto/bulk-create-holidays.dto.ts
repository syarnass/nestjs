import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateHolidayDto } from './create-holiday.dto';

/** Import banyak hari libur sekaligus, mis. dari SKB 3 Menteri. */
export class BulkCreateHolidaysDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateHolidayDto)
  holidays: CreateHolidayDto[];
}
