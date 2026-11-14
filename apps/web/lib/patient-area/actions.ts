'use server';

import { login } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, sessionCookies } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { env } from '@/lib/env';
import type { ActionResult, AppAccess, InvitePreview, PatientArea } from './types';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> };

async function call(path: string, method: string, body?: unknown, auth = true): Promise<{ status: number; json: Json }> {
  const t = auth ? (await cookies()).get(ACCESS_COOKIE)?.value : undefined;
  if (auth && !t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const isId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const isToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
const msg = (r: { json: Json }, fallback: string) => r.json?.errors?.[0]?.message ?? fallback;

// ── Lado do nutricionista ────────────────────────────────────────────────

export async function getAppAccess(patientId: string): Promise<AppAccess | null> {
  if (!isId(patientId)) return null;
  try {
    const r = await call(`/patients/${patientId}/app-access`, 'GET');
    return r.status === 200 ? (r.json?.data as AppAccess) : null;
  } catch {
    return null;
  }
}

/** Cria o convite e devolve o link (o token só aparece agora; depois só dá para gerar outro). */
export async function invitePatient(patientId: string, email: string): Promise<ActionResult<{ link: string; expires_at: string }>> {
  if (!isId(patientId)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/patients/${patientId}/app-invite`, 'POST', { email });
    if (r.status === 201) {
      const d = r.json?.data as { token: string; expires_at: string };
      revalidatePath(`/app/pacientes/${patientId}`);
      return { ok: true, data: { link: `${env.NEXT_PUBLIC_SITE_URL}/p/convite/${d.token}`, expires_at: d.expires_at } };
    }
    if (r.status === 400) return { ok: false, message: 'Informe um e-mail válido.', field: 'email' };
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 409) return { ok: false, message: msg(r, 'Não foi possível convidar agora.'), field: 'email' };
    return { ok: false, message: 'Não foi possível criar o convite agora.' };
  } catch {
    return { ok: false, message: 'Não foi possível criar o convite agora.' };
  }
}

export async function revokeAppAccess(patientId: string): Promise<ActionResult> {
  if (!isId(patientId)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/patients/${patientId}/app-access/revoke`, 'POST');
    if (r.status === 200) {
      revalidatePath(`/app/pacientes/${patientId}`);
      return { ok: true };
    }
    return { ok: false, message: 'Não foi possível revogar agora.' };
  } catch {
    return { ok: false, message: 'Não foi possível revogar agora.' };
  }
}

// ── Lado do paciente ─────────────────────────────────────────────────────

/** Registros ligados à conta logada. Null se falhar ou sem sessão. */
export async function getPatientArea(): Promise<PatientArea | null> {
  try {
    const r = await call('/me/patient', 'GET');
    return r.status === 200 ? (r.json?.data as PatientArea) : null;
  } catch {
    return null;
  }
}

export async function openInvite(token: string): Promise<{ ok: true; data: InvitePreview } | { ok: false; reason: 'unavailable' | 'error' }> {
  if (!isToken(token)) return { ok: false, reason: 'unavailable' };
  try {
    const r = await call('/public/patient-invites/open', 'POST', { token }, false);
    if (r.status === 200) return { ok: true, data: r.json?.data as InvitePreview };
    return { ok: false, reason: r.status === 410 || r.status === 404 ? 'unavailable' : 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Primeiro acesso: cria a conta com a senha escolhida, entra e vai para a área do paciente. */
export async function acceptInviteWithPassword(token: string, password: string, confirm: string): Promise<ActionResult> {
  if (!isToken(token)) return { ok: false, message: 'Convite inválido.' };
  if (password.length < 8) return { ok: false, message: 'A senha precisa ter pelo menos 8 caracteres.', field: 'password' };
  if (password !== confirm) return { ok: false, message: 'As senhas não conferem.', field: 'confirm' };
  let email: string;
  try {
    const r = await call('/public/patient-invites/accept', 'POST', { token, password }, false);
    if (r.status === 409) return { ok: false, message: msg(r, 'Já existe uma conta com este e-mail.') };
    if (r.status === 410) return { ok: false, message: msg(r, 'Este convite não está mais disponível.') };
    if (r.status === 400) return { ok: false, message: 'A senha precisa ter de 8 a 128 caracteres.', field: 'password' };
    if (r.status !== 201) return { ok: false, message: 'Não foi possível criar seu acesso agora. Tente de novo em instantes.' };
    email = (r.json?.data as { email: string }).email;
  } catch {
    return { ok: false, message: 'Não foi possível criar seu acesso agora. Tente de novo em instantes.' };
  }
  try {
    const tokens = await directus().request(login({ email, password }, { mode: 'json' }));
    const store = await cookies();
    for (const c of sessionCookies(tokens)) store.set(c.name, c.value, c.options);
  } catch {
    redirect('/login?next=/p');
  }
  redirect('/p');
}

/** Conta de paciente já existente (outro nutricionista): aceita o convite estando logada. */
export async function acceptInviteLoggedIn(token: string): Promise<ActionResult> {
  if (!isToken(token)) return { ok: false, message: 'Convite inválido.' };
  try {
    const r = await call('/patient-invites/accept', 'POST', { token });
    if (r.status === 200) {
      revalidatePath('/p');
      return { ok: true };
    }
    if (r.status === 401) return { ok: false, message: 'Entre com a sua conta para aceitar o convite.' };
    return { ok: false, message: msg(r, 'Não foi possível aceitar o convite agora.') };
  } catch {
    return { ok: false, message: 'Não foi possível aceitar o convite agora.' };
  }
}
