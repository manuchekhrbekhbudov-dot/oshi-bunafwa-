import 'dotenv/config';

function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

/**
 * Реҷаи сабти ном (REGISTRATION):
 *  - 'first-user' (пешфарз): танҳо ҳисоби аввалин сохта мешавад — платформаи шахсии як соҳиб
 *  - 'open': ҳар кас метавонад сабти ном кунад
 *  - 'closed': сабти ном пурра пӯшида
 * Ҳар дафъа аз env хонда мешавад (барои тестҳо ва тағйир бе build).
 */
export type RegistrationMode = 'first-user' | 'open' | 'closed';
export function registrationMode(): RegistrationMode {
  const v = (process.env.REGISTRATION || 'first-user').toLowerCase();
  return v === 'open' || v === 'closed' ? v : 'first-user';
}

export const config = {
  port: num(process.env.PORT, 4000),
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  // Дар Render суроғаи сайт худкор аз RENDER_EXTERNAL_URL гирифта мешавад
  appUrl: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 14),
  sessionCookie: 'hisob_sid',
  timeZone: 'Asia/Dushanbe',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'HISOB PRO <no-reply@hisob.pro>',
  },
} as const;
