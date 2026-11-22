import { z } from 'zod';
import { CURRENCIES, parseAmount } from './money.js';
import { isDayString, parseLocalDateTime } from './dates.js';

export const currencySchema = z.enum(CURRENCIES, { errorMap: () => ({ message: 'Асъори нодуруст' }) });

/** Маблағ: сатри "1234.56" ё рақам; ҳамеша мусбат, ҳадди аксар 2 рақами даҳӣ */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const d = parseAmount(v);
    if (!d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Маблағ бояд рақами мусбат бо то 2 рақами даҳӣ бошад' });
      return z.NEVER;
    }
    return d.toFixed(2);
  });

export const dateTimeSchema = z.string().transform((v, ctx) => {
  const d = parseLocalDateTime(v);
  if (!d) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Сана/вақти нодуруст' });
    return z.NEVER;
  }
  return d;
});

export const daySchema = z.string().refine(isDayString, 'Санаи нодуруст (yyyy-MM-dd)');

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Ҳадди аксар ${max} аломат`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const idSchema = z.string().min(1).max(64);
