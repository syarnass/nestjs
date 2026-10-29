import { Role } from '@prisma/client';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { DATE_ONLY_REGEX } from '../../common/utils/date.util';

/** Membuat akun login sekaligus data kepegawaiannya. */
export class CreateEmployeeDto extends CreateUserDto {
  /** Hanya MANAGER atau EMPLOYEE; default EMPLOYEE. */
  @IsOptional()
  @IsIn([Role.MANAGER, Role.EMPLOYEE])
  declare role?: Role;

  /** Nomor induk karyawan (NIK). @example EMP-0001 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  employeeNumber: string;

  /** @example Software Engineer */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  position: string;

  /** @example Engineering */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  department: string;

  /** Format YYYY-MM-DD. @example 2024-01-15 */
  @Matches(DATE_ONLY_REGEX, { message: 'joinDate harus berformat YYYY-MM-DD' })
  @IsDateString({ strict: true })
  joinDate: string;

  /** ID karyawan atasan langsung (harus ber-role MANAGER/ADMIN). */
  @IsOptional()
  @IsInt()
  managerId?: number;
}
