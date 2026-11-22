import 'dotenv/config';
import { execSync } from 'node:child_process';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn('[tests] TEST_DATABASE_URL нест — тестҳои интегратсионӣ гузаронида мешаванд (skip).');
    return;
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
