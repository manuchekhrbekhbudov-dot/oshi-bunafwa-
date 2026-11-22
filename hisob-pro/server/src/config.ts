import 'dotenv/config';

function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export const config = {
  port: num(process.env.PORT, 4000),
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
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
