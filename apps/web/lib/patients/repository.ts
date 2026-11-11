import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import type { Patient } from './schema';

const FIELDS = ['id', 'full_name', 'birth_date', 'sex', 'email', 'phone', 'objective', 'status', 'created_at'];

/**
 * Pacientes do consultório, com o token do usuário (as permissões do Directus limitam
 * aos consultórios em que ele é owner ou nutricionista). Null se o Directus falhar.
 */
export async function listPatients(organizationId: string): Promise<Patient[] | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await directus().request<Patient[]>(
      withToken(
        token,
        readItems('patients' as never, {
          fields: FIELDS,
          filter: { organization_id: { _eq: organizationId } },
          sort: ['full_name'],
          limit: 1000,
        } as never),
      ),
    );
  } catch (error) {
    console.error('patients: falha ao listar', directusErrorInfo(error));
    return null;
  }
}

const DETAIL_FIELDS = [...FIELDS, 'cpf', 'updated_at', 'organization_id'];

/**
 * Um paciente do consultório (com o token do usuário).
 * `undefined` = não existe ou não pertence aos consultórios do usuário; `null` = falha no Directus.
 */
export async function getPatient(id: string): Promise<Patient | null | undefined> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await directus().request<Patient[]>(
      withToken(token, readItems('patients' as never, { fields: DETAIL_FIELDS, filter: { id: { _eq: id } }, limit: 1 } as never)),
    );
    return rows[0];
  } catch (error) {
    console.error('patients: falha ao ler', directusErrorInfo(error));
    return null;
  }
}
