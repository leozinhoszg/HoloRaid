import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../logger/logger';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err, reqId: (req as any).id }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }
  logger.error({ err, reqId: (req as any).id }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erro interno' } });
};
