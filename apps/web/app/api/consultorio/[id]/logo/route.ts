import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

/** Logo do consultório com o token do usuário (o Directus confere o vínculo). SVG vai isolado por CSP. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || !/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/practices/${id}/logo`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !res.body || !/^image\/(png|jpeg|webp|svg\+xml)/.test(type)) return new Response(null, { status: 404 });
  return new Response(res.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
