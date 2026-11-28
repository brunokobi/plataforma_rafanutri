import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, TRANSIENT_COOKIE, clearedCookies, sessionCookies, type TokenSet } from '@/lib/auth/cookies';

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

/** Validade (exp, em segundos) do JWT de acesso, sem conferir assinatura; null se não der para ler. */
export function tokenExp(token: string | undefined): number | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

/** Token de acesso que ainda vale (com 10 s de folga). Sem exp legível, confia no cookie. */
export function accessValid(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const exp = tokenExp(token);
  return exp === null || exp * 1000 > now + 10_000;
}

/** Confere no Directus se o token de acesso é aceito (só no /login, para não prender a pessoa num laço). */
async function accepted(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${DIRECTUS_URL}/users/me?fields=id`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return true; // Directus fora do ar: não derruba a sessão por isso
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // A área do paciente (/p) exige login, menos o convite (/p/convite/…), que é público.
  const isPatientInvite = pathname.startsWith('/p/convite/');
  const isProtected = ['/app', '/onboarding', '/p'].some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !isPatientInvite;
  const isLogin = pathname === '/login';

  // Cookie com token vencido conta como sem sessão (vai para a renovação abaixo).
  let hasSession = accessValid(request.cookies.get(ACCESS_COOKIE)?.value);
  let cookiesToSet: ReturnType<typeof sessionCookies> = [];

  // Token de acesso expirado: tenta renovar com o refresh token.
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!hasSession && refreshToken && (isProtected || isLogin)) {
    const tokens = await refresh(refreshToken);
    // sessão só deste navegador continua sem prazo depois da renovação
    cookiesToSet = tokens ? sessionCookies(tokens, !request.cookies.has(TRANSIENT_COOKIE)) : clearedCookies();
    hasSession = Boolean(tokens?.access_token);
    for (const c of cookiesToSet) request.cookies.set(c.name, c.value);
  }

  // No /login com sessão: só manda para o app se o Directus aceitar o token; senão limpa e mostra o login
  // (evita o laço /login → /app → /login quando o token foi revogado).
  if (isLogin && hasSession && !cookiesToSet.length) {
    const token = request.cookies.get(ACCESS_COOKIE)?.value;
    if (token && !(await accepted(token))) {
      hasSession = false;
      cookiesToSet = clearedCookies();
      for (const c of cookiesToSet) request.cookies.set(c.name, c.value);
    }
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
