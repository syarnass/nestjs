import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** @example admin@hr.local */
  @IsEmail()
  email: string;

  /** @example Admin123! */
  @IsString()
  @MinLength(8)
  password: string;
}
