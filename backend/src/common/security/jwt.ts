import jwt from 'jsonwebtoken';
import { getConfig } from '../../config';
import { UnauthorizedError } from '../errors/AppError';

export type AccessClaims = { sub: number; role: 'user' | 'admin' };

export function signAccessToken(claims: AccessClaims): string {
  const cfg = getConfig();
  return jwt.sign(claims, cfg.JWT_SECRET, {
    expiresIn: cfg.ACCESS_TOKEN_TTL,
    algorithm: 'HS256',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessClaims {
  const cfg = getConfig();
  try {
    const decoded = jwt.verify(token, cfg.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded === null) throw new Error('Invalid claims');
    const { sub, role } = decoded as Record<string, unknown>;
    if (typeof sub !== 'number' || (role !== 'user' && role !== 'admin')) {
      throw new Error('Invalid claims');
    }
    return { sub, role };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
