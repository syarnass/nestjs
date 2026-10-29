import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveLeaveRequestDto {
  /** Catatan opsional dari atasan. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectLeaveRequestDto {
  /** Alasan penolakan wajib diisi. @example Bentrok dengan deadline proyek */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note: string;
}
