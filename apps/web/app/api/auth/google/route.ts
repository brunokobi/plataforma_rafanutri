import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { isSignupOpen } from '@/lib/flags';
import { GOOGLE_STATE_COOKIE, GOOGLE_STATE_MAX_AGE, encodeState, googleAuthUrl, googleConfig, googleRedirectUri } from '@/lib/auth/google';
import { safeRedirect } from '@/lib/auth/safe-redirect';

export const dynamic = 'force-dynamic';

/** Início do login pelo Google: guarda state/nonce num cookie httpOnly e manda para o Google. */
export async function GET(req: NextRequest) {
  const intent = req.nextUrl.searchParams.get('intent') === 'signup' && isSignupOpen() ? 'signup' : 'login';
  const back = intent === 'signup' ? '/cadastro' : '/login';
  const config = await googleConfig();
  if (!config) return NextResponse.redirect(new URL(`${back}?google=indisponivel`, env.NEXT_PUBLIC_SITE_URL));
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const next = safeRedirect(req.nextUrl.searchParams.get('next'));
  const res = NextResponse.redirect(googleAuthUrl({ clientId: config.clientId, redirectUri: googleRedirectUri(), state, nonce }));
  res.cookies.set(GOOGLE_STATE_COOKIE, encodeState({ state, nonce, next, intent }), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/google', maxAge: GOOGLE_STATE_MAX_AGE,
  });
  return res;
}
