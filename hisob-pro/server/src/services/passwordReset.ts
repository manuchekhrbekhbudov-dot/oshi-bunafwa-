/**
 * Барқарорсозии парол бо коди 6-рақама (на линк).
 * Код дар база танҳо ҳамчун hash (бо id-и корбар) нигоҳ дошта мешавад.
 */
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { hashToken } from './auth.js';

export const RESET_CODE_TTL_MIN = 15;
export const RESET_CODE_MAX_ATTEMPTS = 5;

/** Код бо id-и корбар hash мешавад — кодҳои якхелаи корбарони гуногун бархӯрд намекунанд */
export const codeHash = (userId: string, code: string) => hashToken(`reset-code:${userId}:${code}`);

/** Коди нав месозад (кодҳои кӯҳнаи истифоданашуда бекор мешаванд) */
export async function issueResetCode(userId: string): Promise<string> {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: codeHash(userId, code), expiresAt: new Date(Date.now() + RESET_CODE_TTL_MIN * 60_000) },
  });
  return code;
}
