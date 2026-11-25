/**
 * Фишурдани сурат дар браузер пеш аз фиристодан: то 1280px, JPEG ~75%.
 * Сурати 4 MB-и камераи телефон → ~150–300 KB (интернети мобилӣ ва база сарфа мешавад).
 */
export async function compressImage(file: File, maxDim = 1280, quality = 0.75): Promise<string> {
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (bitmap) {
    source = bitmap;
    w = bitmap.width;
    h = bitmap.height;
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!w || !h) throw new Error('bad image');
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#fff'; // PNG-и шаффоф → заминаи сафед
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export const photoUrl = (txId: string, version?: string) =>
  `/api/transactions/${txId}/photo${version ? `?v=${encodeURIComponent(version)}` : ''}`;
