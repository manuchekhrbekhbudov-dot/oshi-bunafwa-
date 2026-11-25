/** Тоза кардани суроғаи PostgreSQL: бе `channel_binding`, бо `sslmode=require` барои Neon */
export function cleanDatabaseUrl(url) {
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
