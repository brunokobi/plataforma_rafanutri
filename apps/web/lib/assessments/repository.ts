import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import type { Assessment } from './schema';

const FIELDS = ['id', 'patient_id', 'assessed_at', 'weight_kg', 'height_cm', 'waist_cm', 'hip_cm', 'protocol', 'density_equation', 'skinfolds', 'results', 'notes', 'date_created'];

/**
 * Avaliações do paciente, da mais recente para a mais antiga.
 * `unavailable` enquanto a coleção não estiver liberada no Directus (403); `null` em outra falha.
 */
export async function listAssessments(patientId: string): Promise<Assessment[] | null | 'unavailable'> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await directus().request<Assessment[]>(
      withToken(
        token,
        readItems('anthropometric_assessments' as never, {
          fields: FIELDS,
          filter: { patient_id: { _eq: patientId } },
          sort: ['-assessed_at', '-date_created'],
          limit: 200,
        } as never),
      ),
    );
    // numeric do Postgres chega como string pela API
    return rows.map((r) => ({
      ...r,
      weight_kg: r.weight_kg === null ? null : Number(r.weight_kg),
      height_cm: r.height_cm === null ? null : Number(r.height_cm),
      waist_cm: r.waist_cm === null ? null : Number(r.waist_cm),
      hip_cm: r.hip_cm === null ? null : Number(r.hip_cm),
    }));
  } catch (error) {
    const info = directusErrorInfo(error);
    if (info.status === 403) return 'unavailable';
    console.error('assessments: falha ao listar', info);
    return null;
  }
}
