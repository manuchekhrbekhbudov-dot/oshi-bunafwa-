import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';

const BCRYPT_ROUNDS = 12;

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_ROUNDS);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Дар база танҳо hash-и токен нигоҳ дошта мешавад — агар база дуздида шавад, сессияҳо истифода намешаванд */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string, meta: { userAgent?: string; ip?: string }) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86400_000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300),
      ip: meta.ip?.slice(0, 64),
    },
  });
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.sessionCookie, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd });
}

export const passwordPolicy = (pw: string) => pw.length >= 8 && /[A-Za-zА-Яа-яЁёӢӣҚқҒғҲҳҶҷӮӯ]/.test(pw) && /\d/.test(pw);
