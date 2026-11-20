export const ACCESS_COOKIE = 'rn_at';
export const REFRESH_COOKIE = 'rn_rt';
/** Marca de sessão só deste navegador ("Lembrar de mim" desmarcado): o refresh vira cookie de sessão. */
export const TRANSIENT_COOKIE = 'rn_tmp';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60;

export interface TokenSet {
  access_token: string | null;
  refresh_token: string | null;
  expires: number | null; // ms
}

export interface CookieToSet {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge?: number };
}

const base = () => ({
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/' as const,
});

/**
 * Cookies httpOnly da sessão: o token nunca fica acessível ao JavaScript do navegador.
 * `persistent = false` ("Lembrar de mim" desmarcado): o refresh token e a marca rn_tmp ficam sem prazo
 * (somem ao fechar o navegador) e a renovação automática mantém isso.
 */
export function sessionCookies(tokens: TokenSet, persistent = true): CookieToSet[] {
  if (!tokens.access_token || !tokens.refresh_token) return clearedCookies();
  const accessMaxAge = Math.max(30, Math.floor((tokens.expires ?? 900_000) / 1000) - 10);
  return [
    { name: ACCESS_COOKIE, value: tokens.access_token, options: { ...base(), maxAge: accessMaxAge } },
    persistent
      ? { name: REFRESH_COOKIE, value: tokens.refresh_token, options: { ...base(), maxAge: REFRESH_MAX_AGE } }
      : { name: REFRESH_COOKIE, value: tokens.refresh_token, options: base() },
    persistent ? { name: TRANSIENT_COOKIE, value: '', options: { ...base(), maxAge: 0 } } : { name: TRANSIENT_COOKIE, value: '1', options: base() },
  ];
}

export function clearedCookies(): CookieToSet[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE, TRANSIENT_COOKIE].map((name) => ({ name, value: '', options: { ...base(), maxAge: 0 } }));
}
