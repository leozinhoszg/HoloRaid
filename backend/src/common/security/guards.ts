import type { RequestHandler } from 'express';
import { verifyAccessToken, type AccessClaims } from './jwt';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessClaims;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing token'));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'admin') return next(new ForbiddenError('Requer admin'));
  next();
};
