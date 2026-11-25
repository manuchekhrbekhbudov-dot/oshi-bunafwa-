/**
 * Сабти ном тавассути рақами Telegram.
 *
 * 1. Сайт: ном + парол → PendingRegistration (15 дақиқа) → линки t.me/BOT?start=reg_CODE
 * 2. Бот: /start reg_CODE → тугмаи «📱 Фиристодани рақам» (request_contact)
 * 3. Бот: контакт → санҷиш: contact.user_id === from.id (рақами худи корбар, на каси дигар)
 *    → як ҳисоб барои як рақам ва як Telegram → User + TelegramLink
 * 4. Сайт ҳолатро месанҷад (pollToken) → сессия → корбар ворид мешавад.
 */
import crypto from 'node:crypto';
import { Prisma, type Language } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { registrationMode } from '../config.js';
import { telegramEnabled } from './telegram/transport.js';
import { hashToken, randomToken } from './auth.js';
import { createUserDefaults } from './defaults.js';

export const PENDING_TTL_MIN = 15;

/** "+992 90 123-45-67", "992901234567", "901234567" → "+992901234567" */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = `992${d}`; // рақами маҳаллии Тоҷикистон
  if (d.length < 10 || d.length > 15) return null;
  return `+${d}`;
}

export async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export function setSetting(key: string, value: string) {
  return prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Соҳиби платформа — аввалин корбар */
export async function ownerId(): Promise<string | null> {
  const u = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  return u?.id ?? null;
}

export type OwnerRegistration = 'telegram' | 'closed';

export interface RegistrationPolicy {
  /** Сабти ном бо email (бе Telegram) */
  email: boolean;
  /** Сабти ном тавассути рақами Telegram */
  telegram: boolean;
}

/**
 * REGISTRATION=open   — ҳама (бо email ё Telegram)
 * REGISTRATION=closed — ҳеҷ кас
 * REGISTRATION=first-user (пешфарз) — корбари аввал (соҳиб) бо email;
 *   баъд танҳо тавассути рақами Telegram, агар соҳиб онро пӯшида накарда бошад.
 */
export async function registrationPolicy(): Promise<RegistrationPolicy> {
  const mode = registrationMode();
  if (mode === 'closed') return { email: false, telegram: false };
  if (mode === 'open') return { email: true, telegram: telegramEnabled() };
  if ((await prisma.user.count()) === 0) return { email: true, telegram: false };
  const setting = ((await getSetting('registration')) ?? 'telegram') as OwnerRegistration;
  return { email: false, telegram: setting === 'telegram' && telegramEnabled() };
}

export async function createPendingRegistration(data: {
  name: string;
  email: string | null;
  passwordHash: string;
  language: Language;
}) {
  const code = crypto.randomBytes(18).toString('base64url'); // 24 аломат — барои /start
  const pollToken = randomToken();
  await prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.pendingRegistration.create({
    data: {
      ...data,
      codeHash: hashToken(code),
      pollTokenHash: hashToken(pollToken),
      expiresAt: new Date(Date.now() + PENDING_TTL_MIN * 60_000),
    },
  });
  return { code, pollToken };
}

const activePending = { completedUserId: null, error: null } as const;

/** /start reg_CODE: чатро ба сабти номи интизорӣ мепайвандад */
export async function attachPendingToChat(code: string, chatId: string, telegramUserId: string) {
  const p = await prisma.pendingRegistration.findUnique({ where: { codeHash: hashToken(code) } });
  if (!p || p.expiresAt < new Date() || p.completedUserId || p.error) return { status: 'expired' as const };
  const already =
    (await prisma.user.findUnique({ where: { telegramUserId }, select: { id: true } })) ||
    (await prisma.telegramLink.findUnique({ where: { chatId }, select: { id: true } }));
  if (already) {
    await prisma.pendingRegistration.update({ where: { id: p.id }, data: { error: 'TELEGRAM_TAKEN' } });
    return { status: 'telegram_taken' as const, language: p.language };
  }
  await prisma.pendingRegistration.update({ where: { id: p.id }, data: { chatId } });
  return { status: 'ok' as const, language: p.language };
}

export type ContactResult =
  | { status: 'no_pending' }
  | { status: 'not_own_contact'; language: Language }
  | { status: 'bad_phone' | 'phone_taken' | 'telegram_taken' | 'email_taken' | 'closed'; language: Language }
  | { status: 'done'; userId: string; name: string; language: Language };

/** Контакти фиристодашуда → ҳисоби нав (агар ҳама санҷишҳо гузаранд) */
export async function completeRegistrationFromContact(
  chatId: string,
  fromId: string,
  contact: { phone_number: string; user_id?: number },
  username: string | null,
): Promise<ContactResult> {
  const p = await prisma.pendingRegistration.findFirst({
    where: { chatId, ...activePending, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!p) return { status: 'no_pending' };
  const language = p.language;
  // Танҳо рақами худи корбар (тугмаи request_contact), на карточкаи каси дигар
  if (contact.user_id === undefined || String(contact.user_id) !== fromId) return { status: 'not_own_contact', language };
  const phone = normalizePhone(contact.phone_number);
  const fail = async (error: 'bad_phone' | 'phone_taken' | 'telegram_taken' | 'email_taken' | 'closed') => {
    await prisma.pendingRegistration.update({ where: { id: p.id }, data: { error: error.toUpperCase() } });
    return { status: error, language } as const;
  };
  if (!phone) return fail('bad_phone');
  if (!(await registrationPolicy()).telegram) return fail('closed');
  if (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) return fail('phone_taken');
  if (await prisma.user.findUnique({ where: { telegramUserId: fromId }, select: { id: true } })) return fail('telegram_taken');
  if (p.email && (await prisma.user.findUnique({ where: { email: p.email }, select: { id: true } }))) return fail('email_taken');

  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name: p.name, email: p.email, passwordHash: p.passwordHash, language, phone, telegramUserId: fromId },
        select: { id: true, name: true },
      });
      await createUserDefaults(tx, u.id);
      await tx.telegramLink.deleteMany({ where: { OR: [{ chatId }, { userId: u.id }] } });
      await tx.telegramLink.create({ data: { userId: u.id, chatId, username, step: 'income_source' } });
      await tx.pendingRegistration.update({ where: { id: p.id }, data: { completedUserId: u.id } });
      return u;
    });
    return { status: 'done', userId: user.id, name: user.name, language };
  } catch (e) {
    // Ду дархости ҳамзамон бо як рақам — танҳо яке мегузарад
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail('phone_taken');
    throw e;
  }
}

export function findPendingByPollToken(pollToken: string) {
  return prisma.pendingRegistration.findUnique({ where: { pollTokenHash: hashToken(pollToken) } });
}
