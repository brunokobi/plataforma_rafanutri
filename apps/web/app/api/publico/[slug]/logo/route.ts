import { env } from '@/lib/env';

/** Logo da página pública (só quando a página está ligada). SVG isolado por CSP. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return new Response(null, { status: 404 });
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/public/practices/${slug}/logo`, { cache: 'no-store' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !res.body || !/^image\/(png|jpeg|webp|svg\+xml)/.test(type)) return new Response(null, { status: 404 });
  return new Response(res.body, {
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
  });
}
