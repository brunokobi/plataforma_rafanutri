// Cookies de sessão. O token de acesso dura 15 min; o refresh token, 7 dias.
export const ACCESS_COOKIE = 'rn_at';
export const REFRESH_COOKIE = 'rn_rt';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires: number; // ms
}

const base = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' };

export function sessionCookies(tokens: AuthTokens) {
  return [
    { name: ACCESS_COOKIE, value: tokens.access_token, options: { ...base, maxAge: Math.floor(tokens.expires / 1000) - 5 } },
    { name: REFRESH_COOKIE, value: tokens.refresh_token, options: { ...base, maxAge: 7 * 24 * 3600 } },
  ];
}

export function clearedCookies() {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({ name, value: '', options: { ...base, maxAge: 0 } }));
}

/** Troca o refresh token por um novo par. Usado pelo middleware. */
export async function refreshTokens(directusUrl: string, refreshToken: string): Promise<AuthTokens | null> {
  const res = await fetch(`${directusUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, mode: 'json' }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data: AuthTokens };
  return json.data;
}
