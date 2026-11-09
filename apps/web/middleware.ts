import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedCookies, refreshTokens, sessionCookies } from '@/lib/directus/session';

const PUBLIC_PATHS = ['/login', '/cadastro', '/recuperar-senha', '/convite'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = path === '/' || PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  let hasSession = request.cookies.has(ACCESS_COOKIE);
  let response = NextResponse.next({ request });

  // Token de acesso expirado: renova com o refresh token.
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!hasSession && refresh) {
    const tokens = await refreshTokens(process.env.DIRECTUS_URL ?? '', refresh);
    const cookies = tokens ? sessionCookies(tokens) : clearedCookies();
    for (const c of cookies) request.cookies.set(c.name, c.value);
    response = NextResponse.next({ request });
    for (const c of cookies) response.cookies.set(c.name, c.value, c.options);
    hasSession = Boolean(tokens);
  }

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
