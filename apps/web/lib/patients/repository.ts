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
