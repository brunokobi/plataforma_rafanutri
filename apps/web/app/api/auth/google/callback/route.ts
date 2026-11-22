import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { isSignupOpen } from '@/lib/flags';
import { sessionCookies } from '@/lib/auth/cookies';
import { GOOGLE_STATE_COOKIE, decodeState, googleRedirectUri, mapGoogleError, type GoogleError } from '@/lib/auth/google';

export const dynamic = 'force-dynamic';

/** Volta do Google: confere o state, troca o código no Directus e grava a sessão nos mesmos cookies do login. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const saved = decodeState(req.cookies.get(GOOGLE_STATE_COOKIE)?.value);
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, env.NEXT_PUBLIC_SITE_URL));
    res.cookies.set(GOOGLE_STATE_COOKIE, '', { path: '/api/auth/google', maxAge: 0 });
    return res;
  };
  const back = (code: GoogleError) => to(`${saved?.intent === 'signup' || code === 'sem_conta' ? '/cadastro' : '/login'}?google=${code}`);

  if (p.get('error')) return back(p.get('error') === 'access_denied' ? 'cancelado' : 'falha');
  const code = p.get('code');
  if (!saved || !code || p.get('state') !== saved.state) return back('expirado');

  const signup = saved.intent === 'signup' && isSignupOpen();
  let body: { data?: { access_token: string; refresh_token: string; expires: number; created?: boolean }; errors?: { extensions?: { code?: string } }[] } | null = null;
  try {
    const r = await fetch(`${env.DIRECTUS_URL}/rafanutri/public/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': req.headers.get('user-agent')?.slice(0, 300) ?? 'rafanutri-web' },
      body: JSON.stringify({ code, redirect_uri: googleRedirectUri(), nonce: saved.nonce, create: signup, accept_terms: signup }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    body = await r.json().catch(() => null);
  } catch (error) {
    console.error('google callback: falha ao falar com o Directus', (error as Error)?.message);
    return back('falha');
  }
  const data = body?.data;
  if (!data?.access_token) return back(mapGoogleError(body?.errors?.[0]?.extensions?.code));

  const res = to(data.created ? '/onboarding' : saved.next);
  for (const c of sessionCookies(data)) res.cookies.set(c.name, c.value, c.options);
  return res;
}
