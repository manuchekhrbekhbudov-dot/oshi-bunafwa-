import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatLocal } from '../lib/dates.js';
import type { serializeTx } from './serialize.js';
import type { Summary, SeriesPoint, CategoryShare, TotalBalance } from './calc.js';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
type Lang = 'tg' | 'ru';
type Tx = ReturnType<typeof serializeTx>;

const L = {
  tg: {
    date: 'Сана', type: 'Намуд', category: 'Категория', amount: 'Маблағ', currency: 'Асъор', account: 'Ҳисоб',
    note: 'Шарҳ', source: 'Манба / Мақсад', method: 'Усули пардохт', income: 'Даромад', expense: 'Хароҷот',
    net: 'Натиҷа', count: 'Шумора', period: 'Давра', transactions: 'Амалиётҳо', report: 'Ҳисобот',
    byCategory: 'Хароҷот аз рӯи категория', share: 'Ҳисса %', dynamics: 'Динамика', opening: 'Баланси аввали рӯз',
    closing: 'Баланси охири рӯз', missing: 'Бе қурб (ба ҷамъ дохил нестанд)', generated: 'Сохта шуд',
    slogan: 'Пулҳои худро оқилона идора кунед.',
  },
  ru: {
    date: 'Дата', type: 'Тип', category: 'Категория', amount: 'Сумма', currency: 'Валюта', account: 'Счёт',
    note: 'Комментарий', source: 'Источник / Назначение', method: 'Способ оплаты', income: 'Доход', expense: 'Расход',
    net: 'Итог', count: 'Кол-во', period: 'Период', transactions: 'Операции', report: 'Отчёт',
    byCategory: 'Расходы по категориям', share: 'Доля %', dynamics: 'Динамика', opening: 'Баланс на начало дня',
    closing: 'Баланс на конец дня', missing: 'Без курса (не включены в итог)', generated: 'Сформирован',
    slogan: 'Управляйте своими деньгами разумно.',
  },
} as const;

const TYPE_LABELS: Record<Lang, Record<string, string>> = {
  tg: {
    INCOME: 'Даромад', EXPENSE: 'Хароҷот', TRANSFER_IN: 'Интиқол (+)', TRANSFER_OUT: 'Интиқол (−)',
    DEBT_LENT: 'Қарз додам', DEBT_BORROWED: 'Қарз гирифтам', DEBT_COLLECTED: 'Қарз баргашт', DEBT_REPAID: 'Қарз пардохтам',
  },
  ru: {
    INCOME: 'Доход', EXPENSE: 'Расход', TRANSFER_IN: 'Перевод (+)', TRANSFER_OUT: 'Перевод (−)',
    DEBT_LENT: 'Дал в долг', DEBT_BORROWED: 'Взял в долг', DEBT_COLLECTED: 'Возврат долга', DEBT_REPAID: 'Погашение долга',
  },
};

const METHOD: Record<Lang, Record<string, string>> = {
  tg: { CASH: 'Нақд', CARD: 'Корт', BANK: 'Бонк' },
  ru: { CASH: 'Наличные', CARD: 'Карта', BANK: 'Банк' },
};

const SIGN: Record<string, string> = {
  INCOME: '+', TRANSFER_IN: '+', DEBT_BORROWED: '+', DEBT_COLLECTED: '+',
  EXPENSE: '-', TRANSFER_OUT: '-', DEBT_LENT: '-', DEBT_REPAID: '-',
};

function txRow(t: Tx, lang: Lang) {
  return [
    formatLocal(new Date(t.occurredAt)),
    TYPE_LABELS[lang][t.type] ?? t.type,
    t.category?.name ?? (t.debt?.counterparty ?? ''),
    `${SIGN[t.type]}${t.amount}`,
    t.currency,
    t.account?.name ?? '',
    t.source ?? t.purpose ?? '',
    t.paymentMethod ? METHOD[lang][t.paymentMethod] : '',
    t.note ?? '',
  ];
}

function txHeader(lang: Lang) {
  const l = L[lang];
  return [l.date, l.type, l.category, l.amount, l.currency, l.account, l.source, l.method, l.note];
}

function csvEscape(v: string): string {
  // Ҳимоя аз CSV/formula injection
  const s = /^[=+\-@\t\r]/.test(v) && !/^[+-]\d/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: string[][]): Buffer {
  return Buffer.from('﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n', 'utf8');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function fontPath(bold = false) {
  const name = bold ? 'DejaVuSans-Bold.ttf' : 'DejaVuSans.ttf';
  for (const p of [path.resolve(__dirname, '../../assets/fonts', name), path.resolve(__dirname, '../assets/fonts', name)]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Font not found: ${name}`);
}

/* ------------------------------ PDF ------------------------------ */

interface PdfTable {
  title?: string;
  header: string[];
  rows: string[][];
  widths: number[]; // ҳиссаҳо
}

function renderPdf(title: string, subtitle: string, kv: [string, string][], tables: PdfTable[], lang: Lang): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: title, Author: 'HISOB PRO' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('R', fontPath());
    doc.registerFont('B', fontPath(true));

    const W = doc.page.width - 72;
    doc.rect(0, 0, doc.page.width, 70).fill('#1e1b4b');
    doc.fillColor('#ffffff').font('B').fontSize(18).text('HISOB PRO', 36, 20);
    doc.font('R').fontSize(9).fillColor('#c4b5fd').text(L[lang].slogan, 36, 44);
    doc.fillColor('#111827').font('B').fontSize(14).text(title, 36, 90);
    doc.font('R').fontSize(9).fillColor('#6b7280').text(subtitle);
    doc.moveDown(0.8);

    // Ҷамъбаст
    for (const [k, v] of kv) {
      const y = doc.y;
      doc.font('R').fontSize(10).fillColor('#374151').text(k, 36, y, { width: W * 0.6 });
      doc.font('B').fillColor('#111827').text(v, 36 + W * 0.6, y, { width: W * 0.4, align: 'right' });
      doc.moveDown(0.25);
    }

    for (const t of tables) {
      doc.moveDown(0.8);
      if (t.title) doc.font('B').fontSize(11).fillColor('#4c1d95').text(t.title, 36);
      doc.moveDown(0.3);
      const total = t.widths.reduce((a, b) => a + b, 0);
      const cols = t.widths.map((w) => (w / total) * W);
      const drawRow = (cells: string[], bold: boolean, fill?: string) => {
        doc.font(bold ? 'B' : 'R').fontSize(8);
        const h = Math.max(...cells.map((c, i) => doc.heightOfString(c || ' ', { width: cols[i] - 6 }))) + 6;
        if (doc.y + h > doc.page.height - 40) {
          doc.addPage();
        }
        const y = doc.y;
        if (fill) doc.rect(36, y, W, h).fill(fill);
        let x = 36;
        cells.forEach((c, i) => {
          doc.fillColor('#111827').text(c, x + 3, y + 3, { width: cols[i] - 6 });
          x += cols[i];
        });
        doc.y = y + h;
        doc.moveTo(36, doc.y).lineTo(36 + W, doc.y).lineWidth(0.3).strokeColor('#e5e7eb').stroke();
      };
      drawRow(t.header, true, '#ede9fe');
      t.rows.forEach((r, i) => drawRow(r, false, i % 2 ? '#fafafa' : undefined));
      doc.x = 36;
    }

    doc.moveDown(1);
    doc.font('R').fontSize(8).fillColor('#9ca3af').text(`${L[lang].generated}: ${formatLocal(new Date())} (Asia/Dushanbe)`, 36);
    doc.end();
  });
}

/* --------------------------- XLSX helpers --------------------------- */

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } };
}

async function xlsxBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ------------------------------ API ------------------------------ */

export interface ExportResult {
  buffer: Buffer;
  mime: string;
  filename: string;
}

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export async function exportTransactions(items: Tx[], format: ExportFormat, lang: Lang, label: string): Promise<ExportResult> {
  const filename = `hisob-pro-transactions-${label}.${format}`;
  const header = txHeader(lang);
  const rows = items.map((t) => txRow(t, lang));
  if (format === 'csv') return { buffer: toCsv([header, ...rows]), mime: MIME.csv, filename };
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HISOB PRO';
    const ws = wb.addWorksheet(L[lang].transactions);
    ws.columns = header.map((h, i) => ({ header: h, width: [18, 16, 20, 14, 8, 18, 24, 12, 30][i] }));
    styleHeader(ws.getRow(1));
    for (const t of items) {
      const r = txRow(t, lang);
      // Маблағ ҳамчун рақам (бо аломат) — дар Excel ҷамъ кардан мумкин аст
      const signed = Number(r[3]);
      ws.addRow([r[0], r[1], r[2], signed, r[4], r[5], r[6], r[7], r[8]]);
    }
    ws.getColumn(4).numFmt = '#,##0.00';
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return { buffer: await xlsxBuffer(wb), mime: MIME.xlsx, filename };
  }
  const buffer = await renderPdf(L[lang].transactions, label, [[L[lang].count, String(items.length)]], [
    {
      header: [header[0], header[1], header[2], header[3], header[4], header[5], header[8]],
      rows: rows.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], r[8]]),
      widths: [14, 12, 14, 11, 6, 13, 22],
    },
  ], lang);
  return { buffer, mime: MIME.pdf, filename };
}

interface ReportLike {
  title: string;
  label: string;
  summary: Summary;
  operationsCount: number;
  series?: SeriesPoint[];
  expenseByCategory: CategoryShare[];
  transactions?: Tx[];
  openingBalance?: TotalBalance;
  closingBalance?: TotalBalance;
}

export async function exportReport(r: ReportLike, format: ExportFormat, lang: Lang): Promise<ExportResult> {
  const l = L[lang];
  const cur = r.summary.viewCurrency;
  const filename = `hisob-pro-report-${r.label}.${format}`;
  const kv: [string, string][] = [
    [l.period, r.label],
    [`${l.income} (${cur})`, r.summary.income],
    [`${l.expense} (${cur})`, r.summary.expense],
    [`${l.net} (${cur})`, r.summary.net],
    [l.count, String(r.operationsCount)],
  ];
  if (r.openingBalance) kv.push([`${l.opening} (${r.openingBalance.base})`, r.openingBalance.total]);
  if (r.closingBalance) kv.push([`${l.closing} (${r.closingBalance.base})`, r.closingBalance.total]);
  if (r.summary.missingRates.length) kv.push([l.missing, r.summary.missingRates.join(', ')]);

  const seriesHeader = [l.date, l.income, l.expense, l.net];
  const seriesRows = (r.series ?? []).map((p) => [p.key, p.income, p.expense, p.net]);
  const catHeader = [l.category, l.amount, l.share, l.count];
  const catRows = r.expenseByCategory.map((c) => [c.name, c.amount, c.share, String(c.count)]);

  if (format === 'csv') {
    const rows: string[][] = [[l.report, r.title], ...kv, []];
    if (seriesRows.length) rows.push([l.dynamics], seriesHeader, ...seriesRows, []);
    rows.push([l.byCategory], catHeader, ...catRows, []);
    if (r.transactions) rows.push([l.transactions], txHeader(lang), ...r.transactions.map((t) => txRow(t, lang)));
    return { buffer: toCsv(rows), mime: MIME.csv, filename };
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HISOB PRO';
    const ws = wb.addWorksheet(l.report);
    ws.addRow(['HISOB PRO — ' + r.title]).font = { bold: true, size: 14 };
    ws.addRow([]);
    for (const [k, v] of kv) {
      const n = Number(v);
      ws.addRow([k, Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(v) ? n : v]);
    }
    ws.getColumn(1).width = 36;
    ws.getColumn(2).width = 18;
    ws.getColumn(2).numFmt = '#,##0.00';
    if (seriesRows.length) {
      const s = wb.addWorksheet(l.dynamics);
      s.columns = seriesHeader.map((h) => ({ header: h, width: 16 }));
      styleHeader(s.getRow(1));
      seriesRows.forEach((row) => s.addRow([row[0], Number(row[1]), Number(row[2]), Number(row[3])]));
      [2, 3, 4].forEach((c) => (s.getColumn(c).numFmt = '#,##0.00'));
    }
    const c = wb.addWorksheet(l.byCategory.slice(0, 31));
    c.columns = catHeader.map((h, i) => ({ header: h, width: i === 0 ? 24 : 14 }));
    styleHeader(c.getRow(1));
    catRows.forEach((row) => c.addRow([row[0], Number(row[1]), Number(row[2]), Number(row[3])]));
    if (r.transactions) {
      const t = wb.addWorksheet(l.transactions);
      t.columns = txHeader(lang).map((h, i) => ({ header: h, width: [18, 16, 20, 14, 8, 18, 24, 12, 30][i] }));
      styleHeader(t.getRow(1));
      r.transactions.forEach((x) => {
        const row = txRow(x, lang);
        t.addRow([row[0], row[1], row[2], Number(row[3]), ...row.slice(4)]);
      });
      t.getColumn(4).numFmt = '#,##0.00';
    }
    return { buffer: await xlsxBuffer(wb), mime: MIME.xlsx, filename };
  }

  const tables: PdfTable[] = [];
  if (seriesRows.length) tables.push({ title: l.dynamics, header: seriesHeader, rows: seriesRows, widths: [3, 3, 3, 3] });
  if (catRows.length) tables.push({ title: l.byCategory, header: catHeader, rows: catRows, widths: [5, 3, 2, 2] });
  if (r.transactions?.length) {
    tables.push({
      title: l.transactions,
      header: [l.date, l.type, l.category, l.amount, l.currency, l.account],
      rows: r.transactions.map((t) => txRow(t, lang).slice(0, 6)),
      widths: [14, 12, 16, 11, 6, 14],
    });
  }
  return { buffer: await renderPdf(`${l.report}: ${r.title}`, r.label, kv, tables, lang), mime: MIME.pdf, filename };
}
