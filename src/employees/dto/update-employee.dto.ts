import { PartialType, PickType } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

export class UpdateEmployeeDto extends PartialType(
  PickType(CreateEmployeeDto, [
    'employeeNumber',
    'position',
    'department',
    'joinDate',
  ] as const),
) {
  /** ID atasan baru, atau `null` untuk menghapus atasan. */
  @IsOptional()
  @IsInt()
  managerId?: number | null;
}
