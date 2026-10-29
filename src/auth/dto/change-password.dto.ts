import { IsString, IsStrongPassword } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  /** Minimal 8 karakter, mengandung huruf besar, huruf kecil, angka, dan simbol. */
  @IsStrongPassword()
  newPassword: string;
}
