import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

/** Foto de evidência do checklist com o token do usuário logado (o Directus confere o acesso à unidade). */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string; position: string }> }) {
  const { runId, position } = await params;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || !/^[0-9a-f-]{36}$/i.test(runId) || !/^\d{1,3}$/.test(position)) return new Response(null, { status: 404 });
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/uan/checklist-runs/${runId}/answers/${position}/photo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !res.body || !/^image\/(jpeg|png)$/.test(type)) return new Response(null, { status: 404 });
  return new Response(res.body, {
    headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  });
}
