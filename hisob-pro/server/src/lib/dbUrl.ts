/** Ҳамон тозакунӣ, ки scripts/db-url.mjs мекунад (барои сервер) */
export function cleanDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  let u = url.trim().replace(/^['"]|['"]$/g, '');
  try {
    const parsed = new URL(u);
    parsed.searchParams.delete('channel_binding');
    if (parsed.hostname.endsWith('neon.tech') && !parsed.searchParams.has('sslmode')) parsed.searchParams.set('sslmode', 'require');
    u = parsed.toString();
  } catch {
    /* суроғаи ғайриоддӣ — ҳамон тавр */
  }
  return u;
}
