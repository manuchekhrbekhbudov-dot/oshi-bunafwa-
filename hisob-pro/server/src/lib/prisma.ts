import { PrismaClient } from '@prisma/client';
import { cleanDatabaseUrl } from './dbUrl.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = cleanDatabaseUrl(process.env.DATABASE_URL);
export const prisma = globalForPrisma.prisma ?? new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
