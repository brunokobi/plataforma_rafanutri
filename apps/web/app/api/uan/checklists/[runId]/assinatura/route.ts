import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

/** Assinatura do checklist com o token do usuário logado. */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || !/^[0-9a-f-]{36}$/i.test(runId)) return new Response(null, { status: 404 });
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/uan/checklist-runs/${runId}/signature`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok || !res.body || res.headers.get('content-type') !== 'image/png') return new Response(null, { status: 404 });
  return new Response(res.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
