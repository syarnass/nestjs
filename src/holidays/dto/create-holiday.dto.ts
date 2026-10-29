import {
  IsDateString,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ONLY_REGEX } from '../../common/utils/date.util';

export class CreateHolidayDto {
  /** Format YYYY-MM-DD. @example 2026-08-17 */
  @Matches(DATE_ONLY_REGEX, { message: 'date harus berformat YYYY-MM-DD' })
  @IsDateString({ strict: true })
  date: string;

  /** @example Hari Kemerdekaan RI */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;
}
