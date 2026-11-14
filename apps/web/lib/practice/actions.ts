'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

export type PracticeResult = { ok: true } | { ok: false; message: string };

async function call(path: string, method: string, body?: unknown): Promise<{ status: number; message: string | null }> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, message: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as { errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } | null;
  const e = json?.errors?.[0];
  return { status: res.status, message: e ? (Object.values(e.extensions?.fields ?? {})[0] ?? e.message) : null };
}
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

async function run(path: string, method: string, body: unknown, fallback: string): Promise<PracticeResult> {
  try {
    const r = await call(path, method, body);
    if (r.status === 200) {
      revalidatePath('/app', 'layout');
      revalidatePath('/p', 'layout');
      return { ok: true };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 404) return { ok: false, message: 'Só o responsável (owner) do consultório muda a marca.' };
    return { ok: false, message: r.message ?? fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}

/** RN-204 — Logo do consultório (data URL PNG/JPEG já reduzida no navegador). Só o owner. */
export async function uploadPracticeLogo(orgId: string, image: string): Promise<PracticeResult> {
  if (!isUuid(orgId) || typeof image !== 'string' || image.length > 900_000) return { ok: false, message: 'Imagem inválida.' };
  return run(`/practices/${orgId}/logo`, 'POST', { image }, 'Não foi possível salvar o logo agora.');
}

export async function removePracticeLogo(orgId: string): Promise<PracticeResult> {
  if (!isUuid(orgId)) return { ok: false, message: 'Pedido inválido.' };
  return run(`/practices/${orgId}/logo`, 'DELETE', undefined, 'Não foi possível remover o logo agora.');
}

export async function savePracticeColor(orgId: string, color: string): Promise<PracticeResult> {
  if (!isUuid(orgId) || !/^#[0-9a-f]{6}$/i.test(color)) return { ok: false, message: 'Cor inválida.' };
  return run(`/practices/${orgId}/brand`, 'PUT', { brand_color: color }, 'Não foi possível salvar a cor agora.');
}

/** RN-055 — CPF ou CNPJ que sai no recibo (só dígitos; vazio apaga). */
export async function savePracticeTaxId(orgId: string, taxId: string): Promise<PracticeResult> {
  const d = typeof taxId === 'string' ? taxId.replace(/\D/g, '') : '';
  if (!isUuid(orgId) || (d && d.length !== 11 && d.length !== 14)) return { ok: false, message: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).' };
  return run(`/practices/${orgId}/brand`, 'PUT', { receipt_tax_id: d }, 'Não foi possível salvar agora.');
}

/** RN-022 — Expediente da agenda (sugestão de horários livres). Só o owner. */
export async function saveWorkSchedule(orgId: string, schedule: { start: string; end: string; weekdays: number[] }): Promise<PracticeResult> {
  const t = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!isUuid(orgId) || !t.test(schedule.start) || !t.test(schedule.end)) return { ok: false, message: 'Horário inválido.' };
  if (schedule.end <= schedule.start) return { ok: false, message: 'O fim do expediente precisa ser depois do início.' };
  if (!schedule.weekdays.length) return { ok: false, message: 'Escolha ao menos um dia.' };
  return run(`/practices/${orgId}/schedule`, 'PUT', { work_start: schedule.start, work_end: schedule.end, work_weekdays: schedule.weekdays }, 'Não foi possível salvar o expediente agora.');
}
