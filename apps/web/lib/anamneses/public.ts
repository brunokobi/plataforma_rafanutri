'use server';

import type { Answers, Questionnaire } from '@rafanutri/forms';
import { env } from '@/lib/env';
import { isAnamnesisToken } from './token';

/** Dados que o formulário público recebe (o mínimo: nada de outros pacientes). */
export interface PublicAnamnesis {
  title: string | null;
  schema: Questionnaire;
  answers: Answers;
  expires_at: string;
  patient_first_name: string | null;
  practice: { name: string | null; brand_color: string | null };
  professional: { name: string | null; crn: string | null } | null;
}

export type PublicLoad = { ok: true; data: PublicAnamnesis } | { ok: false; reason: 'unavailable' | 'error' };
export type PublicSave = { ok: true; status: 'sent' | 'answered' } | { ok: false; message: string; fields?: Record<string, string>; gone?: boolean };

// O token vai no corpo (POST), nunca na URL do Directus, para não entrar em logs de acesso.
const base = () => `${env.DIRECTUS_URL}/rafanutri/public/anamneses/`;

/** Lê o formulário pelo token (sem login). */
export async function loadPublicAnamnesis(token: string): Promise<PublicLoad> {
  if (!isAnamnesisToken(token)) return { ok: false, reason: 'unavailable' };
  try {
    const res = await fetch(base() + 'open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
    if (res.status === 410 || res.status === 404) return { ok: false, reason: 'unavailable' };
    if (!res.ok) return { ok: false, reason: 'error' };
    return { ok: true, data: ((await res.json()) as { data: PublicAnamnesis }).data };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Salva o rascunho (final = false) ou envia as respostas (final = true). */
export async function savePublicAnamnesis(token: string, answers: Answers, final: boolean): Promise<PublicSave> {
  if (!isAnamnesisToken(token)) return { ok: false, message: 'Link inválido.', gone: true };
  try {
    const res = await fetch(base() + 'save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, answers, final: final === true }),
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as { data?: { status: 'sent' | 'answered' }; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } | null;
    if (res.ok && json?.data) return { ok: true, status: json.data.status };
    if (res.status === 410 || res.status === 404) return { ok: false, gone: true, message: 'Este link não está mais disponível. Peça um novo ao seu nutricionista.' };
    if (res.status === 429) return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' };
    if (res.status === 400) return { ok: false, message: json?.errors?.[0]?.message ?? 'Revise as respostas.', fields: json?.errors?.[0]?.extensions?.fields };
    return { ok: false, message: 'Não foi possível salvar agora. Tente novamente em instantes.' };
  } catch {
    return { ok: false, message: 'Sem conexão. Verifique a internet e tente de novo.' };
  }
}
