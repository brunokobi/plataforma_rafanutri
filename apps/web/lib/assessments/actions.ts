'use server';

import { createItem, isDirectusError, withToken } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { getPatient } from '@/lib/patients/repository';
import { ageInYears, isUuid } from '@/lib/patients/schema';
import { CALC_VERSION, computeAssessment } from './compute';
import { assessmentInputSchema, type AssessmentInputData } from './schema';

export type AssessmentActionResult = { ok: true } | { ok: false; message: string };

/** Salva a avaliação. Os resultados são recalculados aqui, sem confiar no que veio do navegador. */
export async function createAssessment(patientId: string, input: AssessmentInputData): Promise<AssessmentActionResult> {
  if (!isUuid(patientId)) return { ok: false, message: 'Pedido inválido.' };
  const parsed = assessmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revise as medidas.' };

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const patient = await getPatient(patientId);
  if (patient === null) return { ok: false, message: 'Não foi possível carregar o paciente agora.' };
  if (patient === undefined || !patient.organization_id) return { ok: false, message: 'Paciente não encontrado.' };

  const d = parsed.data;
  const ageYears = patient.birth_date ? ageInYears(patient.birth_date, new Date(`${d.assessed_at}T12:00:00`)) : null;
  const { results } = computeAssessment(d, { sex: patient.sex, ageYears });

  try {
    await directus().request(
      withToken(
        token,
        createItem('anthropometric_assessments' as never, {
          organization_id: patient.organization_id,
          patient_id: patient.id,
          assessed_at: d.assessed_at,
          age_years: ageYears,
          weight_kg: d.weight_kg,
          height_cm: d.height_cm,
          waist_cm: d.waist_cm,
          hip_cm: d.hip_cm,
          protocol: d.protocol,
          density_equation: d.protocol && d.protocol !== 'isak' && d.protocol !== 'faulkner' ? d.density_equation : null,
          skinfolds: d.skinfolds,
          results,
          calc_version: CALC_VERSION,
          notes: d.notes || null,
        } as never),
      ),
    );
  } catch (error) {
    if (isDirectusError(error)) {
      const status = error.response?.status;
      if (status === 403) return { ok: false, message: 'Você não tem permissão para registrar avaliações neste consultório.' };
      if (status === 429) return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto.' };
      console.error('assessments: erro do Directus', { status, code: error.errors?.[0]?.extensions?.code });
    } else {
      console.error('assessments: erro inesperado', error);
    }
    return { ok: false, message: 'Não foi possível salvar a avaliação agora. Tente novamente em instantes.' };
  }
  revalidatePath(`/app/pacientes/${patientId}`);
  revalidatePath(`/app/pacientes/${patientId}/avaliacoes`);
  return { ok: true };
}
