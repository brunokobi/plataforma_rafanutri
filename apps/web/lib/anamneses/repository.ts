import type { Answers, Questionnaire } from '@rafanutri/forms';
import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';

export type AnamnesisStatus = 'sent' | 'answered' | 'reviewed' | 'cancelled';

export interface Anamnesis {
  id: string;
  patient_id: string;
  title: string | null;
  schema_snapshot: Questionnaire;
  answers: Answers;
  status: AnamnesisStatus;
  token_expires_at: string | null;
  answered_at: string | null;
  reviewed_at: string | null;
  date_created: string;
}

const FIELDS = ['id', 'patient_id', 'title', 'schema_snapshot', 'answers', 'status', 'token_expires_at', 'answered_at', 'reviewed_at', 'date_created'];

/** Anamneses do paciente, da mais recente para a mais antiga (com o token do usuário). */
export async function listAnamneses(patientId: string): Promise<Anamnesis[] | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await directus().request<Anamnesis[]>(
      withToken(token, readItems('anamneses' as never, { fields: FIELDS, filter: { patient_id: { _eq: patientId } }, sort: ['-date_created'], limit: 100 } as never)),
    );
  } catch (error) {
    console.error('anamneses: falha ao listar', directusErrorInfo(error));
    return null;
  }
}
