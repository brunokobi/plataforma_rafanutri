'use server';

import { env } from '@/lib/env';

export type Result = { ok: true } | { ok: false; message: string; field?: 'email' | 'password' | 'confirm' };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Pede o link de redefinição. Resposta sempre neutra: não revela se o e-mail tem conta. */
export async function requestPasswordReset(email: string): Promise<Result> {
  const e = email.trim().toLowerCase();
  if (!EMAIL.test(e) || e.length > 254) return { ok: false, message: 'Digite um e-mail válido.', field: 'email' };
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/auth/password/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ email: e, reset_url: `${env.NEXT_PUBLIC_SITE_URL}/redefinir-senha` }),
    });
    if (res.status === 429) return { ok: false, message: 'Muitos pedidos seguidos. Aguarde um minuto e tente de novo.' };
    if (res.status >= 500) return { ok: false, message: 'Não foi possível enviar agora. Tente de novo em instantes.' };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível enviar agora. Tente de novo em instantes.' };
  }
}

/** Define a senha nova com o token do e-mail. */
export async function resetPassword(token: string, password: string, confirm: string): Promise<Result> {
  if (!token || token.length > 2000) return { ok: false, message: 'Link inválido. Peça um novo.' };
  if (password.length < 8 || password.length > 128) return { ok: false, message: 'A senha precisa ter de 8 a 128 caracteres.', field: 'password' };
  if (password !== confirm) return { ok: false, message: 'As senhas não conferem.', field: 'confirm' };
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/auth/password/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ token, password }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, message: 'Este link expirou ou já foi usado. Peça um novo.' };
    return { ok: false, message: 'Não foi possível trocar a senha agora. Tente de novo em instantes.' };
  } catch {
    return { ok: false, message: 'Não foi possível trocar a senha agora. Tente de novo em instantes.' };
  }
}
