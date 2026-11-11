'use server';

import { createItem, isDirectusError, updateItem, withToken } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { getMyOrganizations } from '@/lib/auth/organizations';
import { isUuid, patientFormSchema, toPatientUpdate, type PatientFormInput, type PatientStatus } from './schema';

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

function validate(input: PatientFormInput) {
  const parsed = patientFormSchema.safeParse(input);
  if (parsed.success) return { data: parsed.data, error: null };
  const fieldErrors: Partial<Record<keyof PatientFormInput, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof PatientFormInput;
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { data: null, error: { ok: false as const, message: 'Revise os campos destacados.', fieldErrors } };
}

export async function createPatient(input: PatientFormInput): Promise<PatientActionResult> {
  const parsed = validate(input);
  if (!parsed.data) return parsed.error;
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

/** Edita os dados do paciente. Campos opcionais vazios apagam o valor salvo. */
export async function updatePatient(id: string, input: PatientFormInput): Promise<PatientActionResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const parsed = validate(input);
  if (!parsed.data) return parsed.error;
  const { token } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    await directus().request(withToken(token, updateItem('patients' as never, id, toPatientUpdate(parsed.data) as never)));
  } catch (error) {
    return { ok: false, message: await patientErrorMessage(error) };
  }
  revalidatePath('/app/pacientes');
  revalidatePath(`/app/pacientes/${id}`);
  return { ok: true };
}

export async function setPatientStatus(id: string, status: PatientStatus): Promise<PatientActionResult> {
  if (!isUuid(id) || !['active', 'inactive', 'archived'].includes(status)) {
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
  revalidatePath(`/app/pacientes/${id}`);
  return { ok: true };
}
