import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { runScheduledJobs, setupWebhook, telegramEnabled } from './services/telegram/bot.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`\n  HISOB PRO API → http://localhost:${config.port}/api  (${config.env})\n`);
});

// Telegram-бот: webhook ба суроғаи сайт + ҷадвал (09:00 ёдраскунӣ, 21:00 ҳисобот/албом/нусха) ҳар 5 дақиқа
if (telegramEnabled()) {
  setupWebhook(config.appUrl)
    .then((ok) => console.log(ok ? '  Telegram-бот пайваст шуд (webhook)' : '  Telegram: webhook танҳо бо https насб мешавад'))
    .catch((e) => console.error('  Telegram webhook хатогӣ:', e.message));
  setInterval(() => {
    runScheduledJobs().catch((e) => console.error('[telegram] tick', e));
  }, 5 * 60_000).unref();
}

// Render (нақшаи ройгон) серверро баъд аз 15 дақиқаи беамалӣ "хоб" мекунад → кушодани сайт ~1 дақиқа.
// Сервер ҳар 10 дақиқа ба суроғаи ҷамъиятии худ дархост мефиристад ва бедор мемонад.
// Хомӯш кардан: KEEP_ALIVE=off. (Як сервер 24/7 ≈ 744 соат — дар ҳудуди 750 соати ройгони Render.)
const publicUrl = process.env.RENDER_EXTERNAL_URL;
if (publicUrl && process.env.KEEP_ALIVE !== 'off') {
  setInterval(() => {
    fetch(`${publicUrl.replace(/\/$/, '')}/api/health`, { headers: { 'user-agent': 'hisob-keep-alive' } }).catch(
      () => undefined,
    );
  }, 10 * 60_000).unref();
  console.log('  Keep-alive: ҳар 10 дақиқа');
}

// Тоза кардани сессияҳои кӯҳна ҳар 6 соат
setInterval(() => {
  prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
}, 6 * 3600_000).unref();

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
