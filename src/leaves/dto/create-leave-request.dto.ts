import {
  IsDateString,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ONLY_REGEX } from '../../common/utils/date.util';

export class CreateLeaveRequestDto {
  /** Format YYYY-MM-DD. @example 2026-11-02 */
  @Matches(DATE_ONLY_REGEX, { message: 'startDate harus berformat YYYY-MM-DD' })
  @IsDateString({ strict: true })
  startDate: string;

  /** Format YYYY-MM-DD, inklusif. @example 2026-11-04 */
  @Matches(DATE_ONLY_REGEX, { message: 'endDate harus berformat YYYY-MM-DD' })
  @IsDateString({ strict: true })
  endDate: string;

  /** @example Acara keluarga */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
