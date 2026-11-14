'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

export type PaidPlan = 'essential' | 'professional' | 'clinic';

export interface PlanUsage {
  plan: { code: string; name: string; max_active_patients: number | null; max_members: number | null };
  role: 'owner' | 'nutritionist' | 'assistant';
  usage: { active_patients: number; archived_patients: number; members: number };
  waitlist: { desired_plan: PaidPlan | null; date_created: string } | null;
}

async function call(path: string, method: string, body?: unknown) {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null as null | { data?: unknown; errors?: Array<{ message: string }> } };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Plano, uso e interesse no plano pago do consultório do usuário. Null se falhar. */
export async function getPlanUsage(): Promise<PlanUsage | null> {
  try {
    const r = await call('/plan', 'GET');
    return r.status === 200 ? (r.json?.data as PlanUsage) : null;
  } catch {
    return null;
  }
}

const PAID: PaidPlan[] = ['essential', 'professional', 'clinic'];

export async function joinWaitlist(desiredPlan: PaidPlan | null, note: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (desiredPlan !== null && !PAID.includes(desiredPlan)) return { ok: false, message: 'Plano inválido.' };
  try {
    const r = await call('/plan/waitlist', 'POST', { desired_plan: desiredPlan, note: note.slice(0, 500) });
    if (r.status === 201) {
      revalidatePath('/app/configuracoes/plano');
      return { ok: true };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 403) return { ok: false, message: 'Só o responsável pelo consultório pode registrar o interesse.' };
    return { ok: false, message: 'Não foi possível registrar agora. Tente de novo em instantes.' };
  } catch {
    return { ok: false, message: 'Não foi possível registrar agora. Tente de novo em instantes.' };
  }
}
