/**
 * Қурби асъор худкор: ҳар рӯз аз Бонки миллии Тоҷикистон (nbt.tj).
 * Агар nbt.tj ҷавоб надиҳад — захира: open.er-api.com (қурби бозор).
 * Қурбҳо ҳамчун «чанд TJS барои 1 воҳид» гирифта шуда, ба асъори асосии ҳар корбар табдил дода мешаванд.
 */
import { prisma } from '../lib/prisma.js';
import { CURRENCIES, Decimal, type CurrencyCode } from '../lib/money.js';
import { shiftDay, todayKey } from '../lib/dates.js';
import { getSetting, setSetting } from './registration.js';

export type RateSource = 'nbt' | 'market';
/** Чанд сомонӣ барои 1 воҳиди асъор */
export interface TjsRates {
  source: RateSource;
  date: string;
  tjsPer: Record<CurrencyCode, string>;
}

/** XML-и nbt.tj: <Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>9.2393</Value></Valute> */
export function parseNbtXml(xml: string): Partial<Record<string, Decimal>> {
  const out: Partial<Record<string, Decimal>> = {};
  for (const block of xml.match(/<Valute\b[\s\S]*?<\/Valute>/gi) ?? []) {
    const code = /<CharCode>\s*([A-Z]{3})\s*<\/CharCode>/i.exec(block)?.[1]?.toUpperCase();
    const nominal = /<Nominal>\s*([\d.,]+)\s*<\/Nominal>/i.exec(block)?.[1]?.replace(',', '.') ?? '1';
    const value = /<Value>\s*([\d.,]+)\s*<\/Value>/i.exec(block)?.[1]?.replace(',', '.');
    if (!code || !value) continue;
    const v = new Decimal(value);
    const n = new Decimal(nominal);
    if (v.gt(0) && n.gt(0)) out[code] = v.div(n);
  }
  return out;
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'HISOB-PRO/1.0' } });
  // nbt.tj ҷавобро бо windows-1251 медиҳад; рақамҳо ва кодҳо ASCII-анд
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: res.ok, status: res.status, text: async () => buf.toString('latin1') };
};
let fetcher: Fetcher = defaultFetcher;
/** Барои тестҳо (null — интернети воқеӣ) */
export function setRatesFetcher(f: Fetcher | null) {
  fetcher = f ?? defaultFetcher;
}

async function fromNbt(day: string): Promise<TjsRates> {
  const res = await fetcher(`https://nbt.tj/ru/kurs/export_xml.php?date=${day}&export=xmlout`);
  if (!res.ok) throw new Error(`nbt.tj ${res.status}`);
  const r = parseNbtXml(await res.text());
  if (!r.USD || !r.RUB) throw new Error('nbt.tj: USD/RUB нест');
  return { source: 'nbt', date: day, tjsPer: { TJS: '1', USD: r.USD.toFixed(6), RUB: r.RUB.toFixed(6) } };
}

async function fromMarket(day: string): Promise<TjsRates> {
  const res = await fetcher('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error(`er-api ${res.status}`);
  const j = JSON.parse(await res.text()) as { rates?: Record<string, number> };
  const tjs = j.rates?.TJS;
  const rub = j.rates?.RUB;
  if (!tjs || !rub) throw new Error('er-api: TJS/RUB нест');
  const usd = new Decimal(tjs);
  return { source: 'market', date: day, tjsPer: { TJS: '1', USD: usd.toFixed(6), RUB: usd.div(rub).toFixed(6) } };
}

/** Қурбҳои имрӯза (аввал Бонки миллӣ, баъд захира) */
export async function fetchTjsRates(day = todayKey()): Promise<TjsRates> {
  // Рӯзҳои истироҳат/ид қурб нашр намешавад → охирин рӯзи кории (то 4 рӯз пеш)
  for (let i = 0; i < 4; i++) {
    try {
      return await fromNbt(shiftDay(day, -i));
    } catch (e) {
      if (i === 3) console.warn('[rates] nbt.tj:', (e as Error).message, '→ захира');
    }
  }
  return fromMarket(day);
}

/** Қурби асъор нисбат ба асъори асосии корбар: (TJS/асъор) ÷ (TJS/асосӣ) */
export function rateFor(t: TjsRates, currency: CurrencyCode, base: CurrencyCode): string {
  return new Decimal(t.tjsPer[currency]).div(t.tjsPer[base]).toDecimalPlaces(6).toFixed(6);
}

/** Охирин қурбҳои гирифташуда (барои нишон додан ва фаъол кардани худкор) */
export async function latestRates(): Promise<TjsRates | null> {
  const s = await getSetting('rates:latest');
  return s ? (JSON.parse(s) as TjsRates) : null;
}

export async function applyRatesToUser(userId: string, base: CurrencyCode, t: TjsRates) {
  const ops = CURRENCIES.filter((c) => c !== base).map((c) =>
    prisma.exchangeRate.upsert({
      where: { userId_currency: { userId, currency: c } },
      create: { userId, currency: c, rate: rateFor(t, c, base), source: t.source },
      update: { rate: rateFor(t, c, base), source: t.source },
    }),
  );
  await prisma.$transaction(ops);
}

/**
 * Як бор дар рӯз (ё force): қурбҳоро мегирад ва ба ҳамаи корбароне, ки «худкор» доранд, мегузорад.
 */
export async function updateAutoRates(opts: { force?: boolean; now?: Date } = {}) {
  const day = todayKey(opts.now);
  if (!opts.force && (await getSetting('rates:lastDay')) === day) return { updated: 0, skipped: true as const };
  const t = await fetchTjsRates(day);
  await setSetting('rates:latest', JSON.stringify(t));
  await setSetting('rates:lastDay', day);
  const users = await prisma.user.findMany({ where: { autoRates: true }, select: { id: true, baseCurrency: true } });
  for (const u of users) await applyRatesToUser(u.id, u.baseCurrency, t);
  console.log(`[rates] ${t.source} ${day}: 1 USD = ${t.tjsPer.USD} TJS, 1 RUB = ${t.tjsPer.RUB} TJS → ${users.length} корбар`);
  return { updated: users.length, rates: t };
}
