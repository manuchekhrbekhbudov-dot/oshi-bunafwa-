/**
 * `prisma migrate deploy` бо суроғаи тозашудаи база.
 * Neon ба охири суроға `channel_binding=require` илова мекунад — Prisma онро намефаҳмад, барои ҳамин хориҷ мешавад.
 * Суроғаро ҳамон тавр, ки Neon медиҳад, ворид кардан мумкин аст.
 */
import { execSync } from 'node:child_process';
import { cleanDatabaseUrl } from './db-url.mjs';

// Дар компютер суроға аз .env меояд (Prisma худаш мехонад); дар Render — аз Environment
if (process.env.DATABASE_URL) process.env.DATABASE_URL = cleanDatabaseUrl(process.env.DATABASE_URL);
execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
