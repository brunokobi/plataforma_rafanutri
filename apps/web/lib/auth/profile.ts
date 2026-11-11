import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { ACCESS_COOKIE } from './cookies';
import { directus, directusErrorInfo } from './directus';

export interface ProfessionalProfile {
  crn: string | null;
  crn_region: string | null;
}

/** CRN e regional do usuário logado (permissão: só o próprio perfil). */
export const getMyProfessionalProfile = cache(async (userId: string): Promise<ProfessionalProfile | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await directus().request<ProfessionalProfile[]>(
      withToken(token, readItems('professional_profiles' as never, { fields: ['crn', 'crn_region'], filter: { user_id: { _eq: userId } }, limit: 1 } as never)),
    );
    return rows[0] ?? null;
  } catch (error) {
    console.error('profile: falha ao ler', directusErrorInfo(error));
    return null;
  }
});
