import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../lib/index.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const prefix = 'Bearer ';

  if (!header || !header.startsWith(prefix)) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or missing token' });
    return;
  }

  const token = header.slice(prefix.length);
  const expected = env.APP_TOKEN;

  let match = false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    // timingSafeEqual requires equal-length buffers; pad to same length.
    if (a.length === b.length) {
      match = timingSafeEqual(a, b);
    } else {
      // Still do a comparison to avoid timing side-channels on length.
      const maxLen = Math.max(a.length, b.length);
      const aPadded = Buffer.alloc(maxLen);
      const bPadded = Buffer.alloc(maxLen);
      a.copy(aPadded);
      b.copy(bPadded);
      timingSafeEqual(aPadded, bPadded); // run it anyway
      match = false;
    }
  } catch {
    match = false;
  }

  if (!match) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or missing token' });
    return;
  }

  next();
}
