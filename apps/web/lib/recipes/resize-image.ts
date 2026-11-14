/** Reduz a foto no navegador para até `max` px no maior lado e devolve JPEG em data URL (≈100–300 KB). */
export async function resizeImage(file: File, max = 1200, quality = 0.82): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use uma foto JPG, PNG ou WebP.');
  if (file.size > 15_000_000) throw new Error('Foto grande demais (máx. 15 MB).');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível ler a foto.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let q = quality;
  let url = canvas.toDataURL('image/jpeg', q);
  while (url.length > 780_000 && q > 0.4) {
    q -= 0.12;
    url = canvas.toDataURL('image/jpeg', q);
  }
  return url;
}
