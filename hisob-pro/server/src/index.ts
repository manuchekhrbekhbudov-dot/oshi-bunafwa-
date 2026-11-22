import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { sendDailySummaries, setupWebhook, telegramEnabled } from './services/telegram/bot.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`\n  HISOB PRO API → http://localhost:${config.port}/api  (${config.env})\n`);
});

// Telegram-бот: webhook ба суроғаи сайт + санҷиши ҳисоботи 21:00 ҳар 5 дақиқа (вақте сервер бедор аст)
if (telegramEnabled()) {
  setupWebhook(config.appUrl)
    .then((ok) => console.log(ok ? '  Telegram-бот пайваст шуд (webhook)' : '  Telegram: webhook танҳо бо https насб мешавад'))
    .catch((e) => console.error('  Telegram webhook хатогӣ:', e.message));
  setInterval(() => {
    sendDailySummaries().catch((e) => console.error('[telegram] tick', e));
  }, 5 * 60_000).unref();
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
