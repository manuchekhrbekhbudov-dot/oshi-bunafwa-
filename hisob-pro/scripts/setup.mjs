// HISOB PRO — танзими якбора: .env → миграция → маълумоти демо
// Иҷро: npm run setup
import { existsSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'server');
const env = path.join(server, '.env');

if (!existsSync(env)) {
  copyFileSync(path.join(server, '.env.example'), env);
  console.log('✔ server/.env сохта шуд (аз .env.example)');
} else {
  console.log('• server/.env аллакай ҳаст');
}

const run = (cmd) => execSync(cmd, { cwd: server, stdio: 'inherit' });
try {
  run('npx prisma migrate deploy');
  console.log('✔ Ҷадвалҳои база сохта шуданд');
} catch {
  console.error(
    '\n✖ Ба PostgreSQL пайваст нашуд.\n' +
      '  1) PostgreSQL-ро оғоз кунед (ё: docker compose up -d)\n' +
      '  2) DATABASE_URL-ро дар server/.env санҷед\n' +
      '  3) Боз: npm run setup\n',
  );
  process.exit(1);
}
if (!process.argv.includes('--no-demo')) {
  run('npx tsx prisma/seed.ts');
}
console.log('\n✔ Тайёр! Акнун: npm run dev  →  http://localhost:5173\n');
