import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

/** Foto da receita com o token do usuário logado (o Directus confere quem pode ver). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || !/^\d+$/.test(id)) return new Response(null, { status: 404 });
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/recipes/${id}/image`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !res.body || !/^image\/(jpeg|png|webp)$/.test(type)) return new Response(null, { status: 404 });
  return new Response(res.body, {
    headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  });
}
