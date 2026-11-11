'use server';

import { createItem, isDirectusError, updateItem, withToken } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { getMyOrganizations } from '@/lib/auth/organizations';
import { patientFormSchema, type PatientFormInput, type PatientStatus } from './schema';

export type PatientActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Partial<Record<keyof PatientFormInput, string>> };

const CLINICAL = new Set(['owner', 'nutritionist']);

/** Traduz o erro do Directus (inclui as mensagens dos ganchos e do banco). */
async function patientErrorMessage(error: unknown): Promise<string> {
  if (isDirectusError(error)) {
    const first = error.errors?.[0];
    const code = first?.extensions?.code;
    const status = error.response?.status;
    if (code === 'RECORD_NOT_UNIQUE') return 'Já existe um paciente com este CPF neste consultório.';
    if (status === 400 && first?.message && /pacientes ativos/.test(first.message)) return first.message;
    if (status === 403) return 'Você não tem permissão para fazer isso neste consultório.';
    if (status === 429) return 'Muitas tentativas seguidas. Aguarde um minuto.';
    console.error('patients: erro do Directus', { status, code });
  } else {
    console.error('patients: erro inesperado', error);
  }
  return 'Não foi possível salvar agora. Tente novamente em instantes.';
}

async function context() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const org = (await getMyOrganizations())?.find((o) => CLINICAL.has(o.role)) ?? null;
  return { token, org };
}

export async function createPatient(input: PatientFormInput): Promise<PatientActionResult> {
  const parsed = patientFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof PatientFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof PatientFormInput;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: 'Revise os campos destacados.', fieldErrors };
  }
  const { token, org } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  if (!org) return { ok: false, message: 'Configure seu consultório antes de cadastrar pacientes.' };

  try {
    await directus().request(
      withToken(token, createItem('patients' as never, { ...parsed.data, organization_id: org.id, status: 'active' } as never)),
    );
  } catch (error) {
    return { ok: false, message: await patientErrorMessage(error) };
  }
  revalidatePath('/app/pacientes');
  return { ok: true };
}

export async function setPatientStatus(id: string, status: PatientStatus): Promise<PatientActionResult> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || !['active', 'inactive', 'archived'].includes(status)) {
    return { ok: false, message: 'Pedido inválido.' };
  }
  const { token } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    await directus().request(withToken(token, updateItem('patients' as never, id, { status } as never)));
  } catch (error) {
    return { ok: false, message: await patientErrorMessage(error) };
  }
  revalidatePath('/app/pacientes');
  return { ok: true };
}
