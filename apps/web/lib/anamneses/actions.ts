'use server';

import { createItem, isDirectusError, updateItem, withToken } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { env } from '@/lib/env';
import { getPatient } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';
import { newAnamnesisToken } from './token';

export type SendResult = { ok: true; link: string; expiresAt: string } | { ok: false; message: string };
export type AnamnesisActionResult = { ok: true } | { ok: false; message: string };

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  if (isDirectusError(error)) {
    const status = error.response?.status;
    const message = error.errors?.[0]?.message ?? '';
    if (/indisponível/.test(message)) return { ok: false, message: 'Esse modelo de questionário não está disponível.' };
    if (status === 403) return { ok: false, message: 'Você não tem permissão para alterar anamneses deste consultório.' };
    if (status === 429) return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto.' };
    console.error('anamneses: erro do Directus', { status, code: error.errors?.[0]?.extensions?.code });
  } else {
    console.error('anamneses: erro inesperado', error);
  }
  return { ok: false, message: fallback };
}

async function authToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

/**
 * Envia uma anamnese ao paciente: gera o link público (o token só existe nesta resposta; o banco
 * guarda o hash) com validade de `days` dias. O banco copia o questionário do modelo.
 */
export async function sendAnamnesis(patientId: string, templateId: string, days = 7): Promise<SendResult> {
  if (!isUuid(patientId) || !isUuid(templateId)) return { ok: false, message: 'Pedido inválido.' };
  const validity = Math.min(30, Math.max(1, Math.round(Number(days) || 7)));
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const patient = await getPatient(patientId);
  if (!patient?.organization_id) return { ok: false, message: 'Paciente não encontrado.' };

  const { token, hash } = newAnamnesisToken();
  const expiresAt = new Date(Date.now() + validity * 86_400_000).toISOString();
  try {
    await directus().request(
      withToken(
        t,
        createItem('anamneses' as never, {
          organization_id: patient.organization_id,
          patient_id: patientId,
          template_id: templateId,
          public_token_hash: hash,
          token_expires_at: expiresAt,
        } as never, { fields: ['id'] } as never),
      ),
    );
  } catch (error) {
    return failure(error, 'Não foi possível gerar o link agora. Tente novamente em instantes.');
  }
  revalidatePath(`/app/pacientes/${patientId}/anamneses`);
  return { ok: true, link: `${env.NEXT_PUBLIC_SITE_URL}/r/${token}`, expiresAt };
}

async function setStatus(id: string, patientId: string, status: 'reviewed' | 'cancelled'): Promise<AnamnesisActionResult> {
  if (!isUuid(id) || !isUuid(patientId)) return { ok: false, message: 'Pedido inválido.' };
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    await directus().request(withToken(t, updateItem('anamneses' as never, id, { status } as never)));
  } catch (error) {
    return failure(error, 'Não foi possível atualizar agora.');
  }
  revalidatePath(`/app/pacientes/${patientId}/anamneses`);
  return { ok: true };
}

export async function reviewAnamnesis(id: string, patientId: string) {
  return setStatus(id, patientId, 'reviewed');
}
export async function cancelAnamnesis(id: string, patientId: string) {
  return setStatus(id, patientId, 'cancelled');
}
