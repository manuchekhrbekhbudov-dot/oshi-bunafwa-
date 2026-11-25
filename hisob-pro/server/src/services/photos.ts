/**
 * Суратҳои харид/чек. Браузер суратро то ~1280px ва JPEG фишурда мефиристад (~100–300 KB);
 * дар база ҳамчун байтҳо нигоҳ дошта мешавад — ба диски муваққатии Render вобаста нест.
 */
import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Намуди файл аз рӯи байтҳои аввал (на аз рӯи ном ё header) */
export function detectImageMime(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

/** "data:image/jpeg;base64,..." ё base64-и холис → байтҳо + mime */
export function decodePhoto(input: string): { data: Buffer; mime: string } {
  const b64 = input.replace(/^data:[\w/+.-]+;base64,/, '').replace(/\s+/g, '');
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw badRequest('BAD_PHOTO', 'Сурати нодуруст');
  const data = Buffer.from(b64, 'base64');
  if (data.length > MAX_PHOTO_BYTES) throw badRequest('PHOTO_TOO_BIG', 'Сурат хеле калон аст (то 5 MB)');
  const mime = detectImageMime(data);
  if (!mime) throw badRequest('BAD_PHOTO', 'Танҳо сурат қабул мешавад (JPEG, PNG, WebP)');
  return { data, mime };
}

export function savePhoto(
  userId: string,
  transactionId: string,
  photo: { data: Buffer; mime: string },
  telegramFileId: string | null = null,
) {
  const fields = { mime: photo.mime, size: photo.data.length, data: photo.data, telegramFileId };
  return prisma.transactionPhoto.upsert({
    where: { transactionId },
    create: { userId, transactionId, ...fields },
    update: fields,
    select: { id: true, size: true },
  });
}

/** Суратҳои харидҳои (хароҷоти) як давра — барои албоми бегоҳ */
export function purchasePhotos(userId: string, from: Date, to: Date) {
  return prisma.transactionPhoto.findMany({
    where: { userId, transaction: { type: 'EXPENSE', occurredAt: { gte: from, lt: to } } },
    include: { transaction: { include: { category: { select: { name: true } } } } },
    orderBy: { transaction: { occurredAt: 'asc' } },
  });
}
