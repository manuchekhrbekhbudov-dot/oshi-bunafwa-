import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/errors.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Роҳ ёфт нашуд' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Чунин сабт аллакай вуҷуд дорад' } });
    }
    if (err.code === 'P2003' || err.code === 'P2014') {
      return res
        .status(409)
        .json({ error: { code: 'IN_USE', message: 'Ин сабт истифода мешавад ва нест карда намешавад' } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ёфт нашуд' } });
    }
  }
  const e = err as { status?: number; code?: string; message?: string; type?: string };
  if (e?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON нодуруст' } });
  }
  if (e?.status && e.status < 500) {
    return res.status(e.status).json({ error: { code: e.code ?? 'ERROR', message: e.message ?? 'Хатогӣ' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Хатогии дохилии сервер' } });
}
