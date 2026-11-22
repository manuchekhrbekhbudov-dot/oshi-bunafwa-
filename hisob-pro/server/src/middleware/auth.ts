import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { clearSessionCookie, hashToken } from '../services/auth.js';
import { unauthorized } from '../lib/errors.js';

/** Ҳимояи API: танҳо бо сессияи дуруст. userId ҳамеша аз сессия гирифта мешавад, на аз клиент. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[config.sessionCookie];
    if (!token || typeof token !== 'string') throw unauthorized();
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      clearSessionCookie(res);
      throw unauthorized('Сессия ба охир расид. Лутфан дубора ворид шавед');
    }
    // Навсозии lastSeenAt на зиёда аз як бор дар 5 дақиқа
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    req.userId = session.userId;
    req.sessionId = session.id;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Муҳофизат аз CSRF: дархостҳои тағйирдиҳанда бояд JSON бошанд ва Origin (агар бошад) бояд иҷозатдодашуда бошад.
 * Браузер JSON-и cross-site-ро бе CORS preflight фиристода наметавонад.
 */
export function csrfGuard(allowedOrigins: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      return next(Object.assign(new Error('Origin not allowed'), { status: 403, code: 'FORBIDDEN_ORIGIN' }));
    }
    const ct = req.headers['content-type'] ?? '';
    const hasBody = req.headers['content-length'] && req.headers['content-length'] !== '0';
    if (hasBody && !ct.includes('application/json')) {
      return next(Object.assign(new Error('JSON required'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' }));
    }
    next();
  };
}
