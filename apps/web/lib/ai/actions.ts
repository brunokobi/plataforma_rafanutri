'use server';

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

export type AiKind = 'question' | 'recipes' | 'anamnesis_summary' | 'plan_suggestion';
export interface AiStatus { enabled: boolean; limit: number; used: number; plan: string }
export type AiResult = { ok: true; answer: string; model: string; used: number; limit: number } | { ok: false; message: string };

async function call(path: string, method: string, body?: unknown) {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null as null | { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(170000),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

export async function getAiStatus(): Promise<AiStatus | null> {
  try {
    const r = await call('/ai/status', 'GET');
    return r.status === 200 ? (r.json?.data as AiStatus) : null;
  } catch {
    return null;
  }
}

/** Pede ao assistente. Do paciente só vai o id: o servidor monta um contexto sem nome, CPF nem contatos. */
export async function askAssistant(input: { kind: AiKind; text?: string; patient_id?: string | null; kcal?: number | null }): Promise<AiResult> {
  try {
    const r = await call('/ai/ask', 'POST', input);
    if (r.status === 200) return { ok: true, ...(r.json?.data as { answer: string; model: string; used: number; limit: number }) };
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    const e = r.json?.errors?.[0];
    return { ok: false, message: Object.values(e?.extensions?.fields ?? {})[0] ?? e?.message ?? 'O assistente não respondeu agora. Tente de novo.' };
  } catch {
    return { ok: false, message: 'O assistente demorou demais para responder. Tente de novo.' };
  }
}
