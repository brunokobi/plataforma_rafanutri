import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

/** Foto da não conformidade (abertura ou fechamento) com o token do usuário logado. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; which: string }> }) {
  const { id, which } = await params;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || !/^[0-9a-f-]{36}$/i.test(id) || (which !== 'opening' && which !== 'closing')) return new Response(null, { status: 404 });
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/uan/non-conformities/${id}/photo/${which}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !res.body || !/^image\/(jpeg|png)$/.test(type)) return new Response(null, { status: 404 });
  return new Response(res.body, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
