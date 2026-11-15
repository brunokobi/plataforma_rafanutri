'use server';

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import { feedbackPage, validateFeedback, type FeedbackInput } from '@/lib/feedback/schema';

/** RN-047 — Envia o feedback do beta para o Directus. */
export async function sendFeedback(input: FeedbackInput): Promise<{ ok: boolean; message?: string }> {
  const invalid = validateFeedback(input);
  if (invalid) return { ok: false, message: invalid };
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/feedback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: input.kind, message: input.message.trim(), page: feedbackPage(input.page) }),
      cache: 'no-store',
    });
    if (res.status === 201) return { ok: true };
    if (res.status === 429) return { ok: false, message: 'Muitos envios hoje. Tente amanhã.' };
    return { ok: false, message: 'Não foi possível enviar agora. Tente novamente em instantes.' };
  } catch {
    return { ok: false, message: 'Não foi possível enviar agora. Tente novamente em instantes.' };
  }
}
