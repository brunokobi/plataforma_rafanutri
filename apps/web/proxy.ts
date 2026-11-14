import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedCookies, sessionCookies, type TokenSet } from '@/lib/auth/cookies';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://rafanutri-api.brunokobi.tech';

async function refresh(refreshToken: string): Promise<TokenSet | null> {
  try {
    const res = await fetch(`${DIRECTUS_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken, mode: 'json' }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data: TokenSet }).data;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // A área do paciente (/p) exige login, menos o convite (/p/convite/…), que é público.
  const isPatientInvite = pathname.startsWith('/p/convite/');
  const isProtected = ['/app', '/onboarding', '/p'].some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !isPatientInvite;
  const isLogin = pathname === '/login';

  let hasSession = request.cookies.has(ACCESS_COOKIE);
  let cookiesToSet: ReturnType<typeof sessionCookies> = [];

  // Token de acesso expirado: tenta renovar com o refresh token.
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!hasSession && refreshToken && (isProtected || isLogin)) {
    const tokens = await refresh(refreshToken);
    cookiesToSet = tokens ? sessionCookies(tokens) : clearedCookies();
    hasSession = Boolean(tokens?.access_token);
    for (const c of cookiesToSet) request.cookies.set(c.name, c.value);
  }

  let response: NextResponse;
  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${pathname}${search}`);
    response = NextResponse.redirect(url);
  } else if (isLogin && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request });
  }

  for (const c of cookiesToSet) response.cookies.set(c.name, c.value, c.options);
  return response;
}

export const config = {
  matcher: ['/app/:path*', '/onboarding/:path*', '/p', '/p/:path*', '/login'],
};
