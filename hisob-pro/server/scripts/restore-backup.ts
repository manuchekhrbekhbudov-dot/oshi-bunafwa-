/**
 * Барқарорсозии маълумот аз нусхаи эҳтиётии Excel (ки бот ҳар бегоҳ ба Telegram мефиристад).
 *
 * Истифода (дар папкаи hisob-pro/server):
 *   npm run db:restore -- путь/hisob-pro-backup.xlsx --phone +992901234567
 *   npm run db:restore -- путь/hisob-pro-backup.xlsx --email you@mail.tj
 *
 * Корбар бояд аллакай вуҷуд дошта бошад (масалан, баъди сохтани базаи нав аз нав сабти ном кунед).
 * ДИҚҚАТ: маълумоти ҳозираи молиявии ҳамин корбар бо маълумоти файл иваз карда мешавад.
 */
import fs from 'node:fs';
import { prisma } from '../src/lib/prisma.js';
import { restoreBackup } from '../src/services/backup.js';
import { normalizePhone } from '../src/services/registration.js';

async function main() {
  const [file, flag, value] = process.argv.slice(2);
  if (!file || !flag || !value || !['--phone', '--email'].includes(flag)) {
    console.error('Истифода: npm run db:restore -- <file.xlsx> --phone +992... | --email you@mail.tj');
    process.exit(1);
  }
  const user =
    flag === '--email'
      ? await prisma.user.findUnique({ where: { email: value.toLowerCase() } })
      : await prisma.user.findUnique({ where: { phone: normalizePhone(value) ?? '' } });
  if (!user) {
    console.error('✖ Корбар ёфт нашуд. Аввал дар сайт сабти ном кунед.');
    process.exit(1);
  }
  const result = await restoreBackup(user.id, fs.readFileSync(file));
  console.log(`✔ Барқарор шуд барои ${user.name}:`, result);
}

main()
  .catch((e) => {
    console.error('✖', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
