import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Menandai route yang bisa diakses tanpa access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
