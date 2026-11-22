import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import type { CurrencyCode, Rates } from '../lib/money.js';

export interface UserContext {
  base: CurrencyCode;
  rates: Rates;
}

/** Асъори асосӣ ва қурбҳои истифодабаранда */
export async function getUserContext(userId: string): Promise<UserContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { baseCurrency: true, exchangeRates: { select: { currency: true, rate: true } } },
  });
  if (!user) throw notFound('Истифодабаранда ёфт нашуд');
  const rates: Rates = {};
  for (const r of user.exchangeRates) rates[r.currency] = r.rate;
  return { base: user.baseCurrency, rates };
}
