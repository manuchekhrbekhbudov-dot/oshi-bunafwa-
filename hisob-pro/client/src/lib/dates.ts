/** Ҳамаи санаҳо дар минтақаи Asia/Dushanbe нишон дода ва ворид карда мешаванд — новобаста аз минтақаи браузер */
import type { Lang } from './types';

export const TZ = 'Asia/Dushanbe';

function parts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o as { year: string; month: string; day: string; hour: string; minute: string };
}

/** 'yyyy-MM-dd' дар Душанбе */
export function dayKey(d: Date | string = new Date()): string {
  const p = parts(typeof d === 'string' ? new Date(d) : d);
  return `${p.year}-${p.month}-${p.day}`;
}

export const todayKey = () => dayKey(new Date());

/** Барои <input type="datetime-local"> — 'yyyy-MM-ddTHH:mm' дар Душанбе */
export function toLocalInput(d: Date | string = new Date()): string {
  const p = parts(typeof d === 'string' ? new Date(d) : d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(day: string) {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function weekStart(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return shiftDay(day, -dow);
}

const MONTHS: Record<Lang, string[]> = {
  tg: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const MONTHS_SHORT: Record<Lang, string[]> = {
  tg: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
  ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
};
const WEEKDAYS: Record<Lang, string[]> = {
  tg: ['Якшанбе', 'Душанбе', 'Сешанбе', 'Чоршанбе', 'Панҷшанбе', 'Ҷумъа', 'Шанбе'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
};

export function formatDay(day: string, lang: Lang, withWeekday = false): string {
  const [y, m, d] = day.split('-').map(Number);
  const base = `${d} ${MONTHS[lang][m - 1]} ${y}`;
  if (!withWeekday) return base;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[lang][wd]}, ${base}`;
}

export function formatDateTime(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

export function formatDate(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.day}.${p.month}.${p.year}`;
}

export function formatTime(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

/** Тамғаи кӯтоҳ барои меҳвари график */
export function seriesLabel(key: string, lang: Lang): string {
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-').map(Number);
    return `${MONTHS_SHORT[lang][m - 1]} ${String(y).slice(2)}`;
  }
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[lang][m - 1]}`;
}

export function greeting(lang: Lang): string {
  const h = Number(parts(new Date()).hour);
  if (lang === 'ru') return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  return h < 5 ? 'Шаби хуш' : h < 12 ? 'Субҳ ба хайр' : h < 18 ? 'Рӯз ба хайр' : 'Шом ба хайр';
}
