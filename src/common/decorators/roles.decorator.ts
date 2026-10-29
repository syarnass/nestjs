import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Membatasi route hanya untuk role tertentu. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
