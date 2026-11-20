'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { LegalDocument } from '@/lib/legal/info';

type Accepted = Array<{ document: string; version: string; accepted_at: string }>;

/** Aceites da conta logada; null sem sessão ou em falha (o aviso não aparece se a API falhar). */
export const getMyTerms = cache(async (): Promise<Accepted | null> => {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return null;
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/me/terms`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    return res.ok ? ((await res.json()).data.accepted as Accepted) : null;
  } catch {
    return null;
  }
});

/** Registra o aceite da versão vigente dos documentos. */
export async function acceptTerms(documents: LegalDocument[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { ok: false, message: 'Entre de novo para continuar.' };
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/me/terms`, {
      method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ documents }), cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: 'Não foi possível registrar o aceite agora.' };
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível registrar o aceite agora.' };
  }
}
