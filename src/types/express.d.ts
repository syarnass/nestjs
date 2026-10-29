import { AuthUser } from '../auth/interfaces/jwt-payload.interface';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
