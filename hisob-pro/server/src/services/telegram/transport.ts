/**
 * Иртибот бо Telegram Bot API: паёмҳо (JSON), файлҳо (сурат, Excel — multipart) ва боргирии файлҳо.
 * Дар тестҳо ҳамаи ин ба функсияҳои санҷишӣ иваз карда мешавад (setTelegramTransport).
 */
import crypto from 'node:crypto';

export type TgSender = (method: string, body: Record<string, unknown>) => Promise<unknown>;

export interface TgFile {
  field: string;
  filename: string;
  mime: string;
  data: Buffer;
}

export interface TgTransport {
  call: TgSender;
  upload: (method: string, fields: Record<string, string>, files: TgFile[]) => Promise<unknown>;
  download: (filePath: string) => Promise<Buffer>;
}

export const telegramToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
/** Суроғаи Bot API (барои санҷиш дар компютер мумкин аст иваз шавад) */
const apiBase = () => (process.env.TELEGRAM_API_URL?.trim() || 'https://api.telegram.org').replace(/\/$/, '');
export const telegramEnabled = () => !!telegramToken();

/** Сирри webhook аз токен ҳосил мешавад — Telegram онро дар header мефиристад */
export const webhookSecret = () =>
  crypto.createHash('sha256').update(`hisob-webhook:${telegramToken()}`).digest('hex').slice(0, 48);

async function parse(res: Response, method: string) {
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result;
}

const real: TgTransport = {
  async call(method, body) {
    const res = await fetch(`${apiBase()}/bot${telegramToken()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return parse(res, method);
  },
  async upload(method, fields, files) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const f of files) form.append(f.field, new Blob([Uint8Array.from(f.data)], { type: f.mime }), f.filename);
    const res = await fetch(`${apiBase()}/bot${telegramToken()}/${method}`, { method: 'POST', body: form });
    return parse(res, method);
  },
  async download(filePath) {
    const res = await fetch(`${apiBase()}/file/bot${telegramToken()}/${filePath}`);
    if (!res.ok) throw new Error(`Telegram download: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
};

let transport: TgTransport = { ...real };

/** Барои тестҳо: паёмҳои JSON ба функсияи дигар мераванд */
export function setTelegramSender(s: TgSender | null) {
  transport.call = s ?? real.call;
}

/** Барои тестҳо: иваз кардани upload/download (null — баргардонидан ба Telegram-и воқеӣ) */
export function setTelegramTransport(t: Partial<TgTransport> | null) {
  transport = t ? { ...transport, ...t } : { ...real };
}

export const tgCall: TgSender = (method, body) => transport.call(method, body);
export const tgUpload: TgTransport['upload'] = (method, fields, files) => transport.upload(method, fields, files);

/** Файли Telegram-ро (масалан сурат) бо file_id мегирад */
export async function tgDownloadFile(fileId: string): Promise<Buffer> {
  const file = (await transport.call('getFile', { file_id: fileId })) as { file_path?: string };
  if (!file.file_path) throw new Error('Telegram getFile: file_path нест');
  return transport.download(file.file_path);
}

let cachedBotUsername: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (!telegramEnabled()) return null;
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = (await transport.call('getMe', {})) as { username?: string };
    cachedBotUsername = me.username ?? null;
  } catch {
    return null;
  }
  return cachedBotUsername;
}

export async function send(chatId: string, text: string, extra: Record<string, unknown> = {}) {
  return transport.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

/** Ҳуҷҷат (масалан нусхаи эҳтиётии Excel) */
export async function sendDocument(chatId: string, file: Omit<TgFile, 'field'>, caption: string, silent = true) {
  return transport.upload(
    'sendDocument',
    { chat_id: chatId, caption, parse_mode: 'HTML', disable_notification: silent ? 'true' : 'false' },
    [{ ...file, field: 'document' }],
  );
}

export interface AlbumItem {
  caption: string;
  /** file_id-и Telegram (агар бошад) ё байтҳои сурат */
  fileId?: string | null;
  data?: Buffer;
  mime?: string;
}

/**
 * Албоми суратҳо: то 10 сурат дар як паём (маҳдудияти Telegram).
 * Суратҳое, ки file_id доранд, бе боргирии дубора фиристода мешаванд.
 */
export async function sendAlbum(chatId: string, items: AlbumItem[]) {
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    const files: TgFile[] = [];
    const media = chunk.map((it, idx) => {
      if (it.fileId) return { type: 'photo', media: it.fileId, caption: it.caption.slice(0, 1000) };
      const field = `p${idx}`;
      files.push({ field, filename: `${field}.jpg`, mime: it.mime ?? 'image/jpeg', data: it.data ?? Buffer.alloc(0) });
      return { type: 'photo', media: `attach://${field}`, caption: it.caption.slice(0, 1000) };
    });
    if (media.length === 1) {
      const m = media[0];
      if (files.length) {
        await transport.upload('sendPhoto', { chat_id: chatId, caption: m.caption }, [{ ...files[0], field: 'photo' }]);
      } else {
        await transport.call('sendPhoto', { chat_id: chatId, photo: m.media, caption: m.caption });
      }
    } else {
      await transport.upload('sendMediaGroup', { chat_id: chatId, media: JSON.stringify(media) }, files);
    }
  }
}
