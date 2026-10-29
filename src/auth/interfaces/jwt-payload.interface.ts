import { Role } from '@prisma/client';

/** Isi token JWT. `sub` = id user (standar JWT). */
export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}

/** Data user yang ditempelkan ke `request.user` setelah token valid. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}
