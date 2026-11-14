/**
 * Logo do consultório reduzido no navegador para até `max` px no maior lado.
 * PNG (mantém a transparência); se passar do limite do servidor, JPEG com fundo branco.
 * Aceita PNG, JPG, WebP e SVG (o SVG vira imagem: o PDF não desenha SVG).
 */
export const LOGO_INPUT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_DATA_URL = 780_000; // ≈ 580 KB, abaixo dos 600 KB do servidor

export function logoInputError(file: { type: string; size: number }): string | null {
  if (!LOGO_INPUT_TYPES.includes(file.type)) return 'Use uma imagem PNG, JPG, WebP ou SVG.';
  if (file.size > 5_000_000) return 'A imagem precisa ter até 5 MB.';
  return null;
}

/** Tamanho final mantendo a proporção (SVG sem tamanho próprio vira `max`). */
export function fitSize(w: number, h: number, max: number): { width: number; height: number } {
  if (!w || !h) return { width: max, height: max };
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function resizeLogo(file: File, max = 512): Promise<string> {
  const error = logoInputError(file);
  if (error) throw new Error(error);
  const img = await loadImage(file).catch(() => {
    throw new Error('Não foi possível ler a imagem.');
  });
  const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível ler a imagem.');
  ctx.drawImage(img, 0, 0, width, height);
  const png = canvas.toDataURL('image/png');
  if (png.length <= MAX_DATA_URL) return png;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  let q = 0.9;
  let jpg = canvas.toDataURL('image/jpeg', q);
  while (jpg.length > MAX_DATA_URL && q > 0.4) {
    q -= 0.12;
    jpg = canvas.toDataURL('image/jpeg', q);
  }
  return jpg;
}
