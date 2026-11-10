export const ACCESS_COOKIE = 'rn_at';
export const REFRESH_COOKIE = 'rn_rt';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60;

export interface TokenSet {
  access_token: string | null;
  refresh_token: string | null;
  expires: number | null; // ms
}

export interface CookieToSet {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge: number };
}

const base = () => ({
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/' as const,
});

/** Cookies httpOnly da sessão: o token nunca fica acessível ao JavaScript do navegador. */
export function sessionCookies(tokens: TokenSet): CookieToSet[] {
  if (!tokens.access_token || !tokens.refresh_token) return clearedCookies();
  const accessMaxAge = Math.max(30, Math.floor((tokens.expires ?? 900_000) / 1000) - 10);
  return [
    { name: ACCESS_COOKIE, value: tokens.access_token, options: { ...base(), maxAge: accessMaxAge } },
    { name: REFRESH_COOKIE, value: tokens.refresh_token, options: { ...base(), maxAge: REFRESH_MAX_AGE } },
  ];
}

export function clearedCookies(): CookieToSet[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({ name, value: '', options: { ...base(), maxAge: 0 } }));
}
