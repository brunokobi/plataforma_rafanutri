'use server';

import { login, logout } from '@directus/sdk';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSchema, type LoginInput } from '@/lib/validation/login';
import { directus, directusErrorInfo } from './directus';
import { REFRESH_COOKIE, clearedCookies, sessionCookies } from './cookies';
import { safeRedirect } from './safe-redirect';

export type SignInResult = { ok: false; message: string; fieldErrors?: Partial<Record<'email' | 'password', string>> };

export async function signIn(input: LoginInput): Promise<SignInResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: SignInResult['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === 'email' || key === 'password') && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: 'Revise os campos destacados.', fieldErrors };
  }

  const { email, password, next } = parsed.data;
  let tokens;
  try {
    tokens = await directus().request(login({ email: email.toLowerCase(), password }, { mode: 'json' }));
  } catch (error) {
    const { status, code } = directusErrorInfo(error);
    if (status === 429 || code === 'REQUESTS_EXCEEDED') {
      return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' };
    }
    if (status === 401 || code === 'INVALID_CREDENTIALS' || code === 'INVALID_PAYLOAD') {
      return { ok: false, message: 'E-mail ou senha incorretos.' };
    }
    console.error('signIn: falha ao falar com o Directus', { status, code });
    return { ok: false, message: 'Não foi possível entrar agora. Tente novamente em instantes.' };
  }

  const store = await cookies();
  for (const c of sessionCookies(tokens)) store.set(c.name, c.value, c.options);
  redirect(safeRedirect(next));
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await directus()
      .request(logout({ refresh_token: refreshToken, mode: 'json' }))
      .catch(() => undefined);
  }
  for (const c of clearedCookies()) store.set(c.name, c.value, c.options);
  redirect('/login');
}
