'use server';

import { revalidatePath } from 'next/cache';
import type { ContactPrefs, NotificationLogItem, NotificationOverview, NotificationSettings, Result } from './types';
import { call } from '@/lib/directus/rafanutri';
import { isUuid as isId } from '@/lib/validation/ids';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> };

const errorOf = (r: { status: number; json: Json }, fallback: string): Result<never> => {
  if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const e = r.json?.errors?.[0];
  return { ok: false, message: e?.message ?? fallback, fields: e?.extensions?.fields };
};
async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await call(path, 'GET');
    return r.status === 200 ? (r.json?.data as T) : null;
  } catch {
    return null;
  }
}
async function send<T>(path: string, method: string, body: unknown, fallback: string, ok = [200, 201]): Promise<Result<T>> {
  try {
    const r = await call(path, method, body);
    if (ok.includes(r.status)) return { ok: true, data: r.json?.data as T };
    return errorOf(r, fallback);
  } catch {
    return { ok: false, message: fallback };
  }
}
const ctx = (c?: string | null) => (c && isId(c) ? `?c=${c}` : '');

// ── Consultório ─────────────────────────────────────────────────────────────

export async function getNotificationOverview(): Promise<NotificationOverview | null> {
  return get<NotificationOverview>('/notifications/settings');
}

export async function getNotificationLog(): Promise<NotificationLogItem[] | null> {
  return get<NotificationLogItem[]>('/notifications/log');
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<Result<NotificationSettings>> {
  const r = await send<NotificationSettings>('/notifications/settings', 'PUT', settings, 'Não foi possível salvar agora.');
  if (r.ok) revalidatePath('/app/configuracoes/avisos');
  return r;
}

export async function sendTestNotification(): Promise<Result<{ email: string }>> {
  return send<{ email: string }>('/notifications/test', 'POST', {}, 'Não foi possível enviar o teste agora.');
}

// ── Paciente, pelo consultório ───────────────────────────────────────────────

export async function getPatientContactPrefs(patientId: string): Promise<ContactPrefs | null> {
  return isId(patientId) ? get<ContactPrefs>(`/patients/${patientId}/notifications`) : null;
}

export async function savePatientContactPrefs(patientId: string, patch: { email_opt_in?: boolean; telegram_opt_in?: boolean }): Promise<Result<ContactPrefs>> {
  if (!isId(patientId)) return { ok: false, message: 'Pedido inválido.' };
  const r = await send<ContactPrefs>(`/patients/${patientId}/notifications`, 'PUT', patch, 'Não foi possível salvar agora.');
  if (r.ok) revalidatePath(`/app/pacientes/${patientId}`);
  return r;
}

export async function createPatientTelegramLink(patientId: string): Promise<Result<{ url: string; expires_at: string }>> {
  if (!isId(patientId)) return { ok: false, message: 'Pedido inválido.' };
  return send(`/patients/${patientId}/notifications/telegram-link`, 'POST', {}, 'Não foi possível gerar o link agora.');
}

export async function unlinkPatientTelegram(patientId: string): Promise<Result> {
  if (!isId(patientId)) return { ok: false, message: 'Pedido inválido.' };
  const r = await send<undefined>(`/patients/${patientId}/notifications/telegram-unlink`, 'POST', {}, 'Não foi possível desligar agora.');
  if (r.ok) revalidatePath(`/app/pacientes/${patientId}`);
  return r;
}

// ── Área do paciente ───────────────────────────────────────────────────────

export async function getMyContactPrefs(c?: string | null): Promise<ContactPrefs | null> {
  return get<ContactPrefs>(`/me/patient/notifications${ctx(c)}`);
}

export async function saveMyContactPrefs(c: string | null, patch: { email_opt_in?: boolean; telegram_opt_in?: boolean }): Promise<Result<ContactPrefs>> {
  const r = await send<ContactPrefs>(`/me/patient/notifications${ctx(c)}`, 'PUT', patch, 'Não foi possível salvar agora.');
  if (r.ok) revalidatePath('/p/avisos');
  return r;
}

export async function createMyTelegramLink(c: string | null): Promise<Result<{ url: string; expires_at: string }>> {
  return send(`/me/patient/notifications/telegram-link${ctx(c)}`, 'POST', {}, 'Não foi possível gerar o link agora.');
}

export async function unlinkMyTelegram(c: string | null): Promise<Result> {
  const r = await send<undefined>(`/me/patient/notifications/telegram-unlink${ctx(c)}`, 'POST', {}, 'Não foi possível desligar agora.');
  if (r.ok) revalidatePath('/p/avisos');
  return r;
}

// ── Público ─────────────────────────────────────────────────────────────────

/** Link "não quero mais e-mails" do rodapé. Devolve o nome do consultório. */
export async function unsubscribeEmail(t: string): Promise<Result<{ practice: string }>> {
  if (typeof t !== 'string' || t.length > 100) return { ok: false, message: 'Link inválido.' };
  try {
    const r = await call('/public/notifications/unsubscribe', 'POST', { t }, false);
    return r.status === 200 ? { ok: true, data: r.json?.data as { practice: string } } : { ok: false, message: 'Este link não é válido.' };
  } catch {
    return { ok: false, message: 'Não foi possível concluir agora. Tente de novo em instantes.' };
  }
}
