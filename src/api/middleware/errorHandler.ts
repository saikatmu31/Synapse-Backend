import type { Request, Response, NextFunction } from 'express';
import { env } from '../../lib/index.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (env.NODE_ENV !== 'test') {
    console.error(err);
  }

  if (
    err instanceof AppError ||
    (typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      'code' in err)
  ) {
    const e = err as { statusCode: number; code: string; message: string };
    res.status(e.statusCode).json({ code: e.code, message: e.message });
    return;
  }

  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
}
