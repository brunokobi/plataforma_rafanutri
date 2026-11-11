import { customEndpoint, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { ACCESS_COOKIE } from './cookies';
import { directus, directusErrorInfo } from './directus';

export { landingRedirect } from './landing';
export type { MemberRole, UserOrganization } from './landing';
import type { UserOrganization } from './landing';

/**
 * Consultórios do usuário logado (endpoint /rafanutri/me/organizations).
 * Devolve null se não houver sessão ou se o Directus falhar: quem chama não deve
 * tratar falha como "não tem consultório".
 */
export const getMyOrganizations = cache(async (): Promise<UserOrganization[] | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await directus().request<UserOrganization[]>(
      withToken(token, customEndpoint({ path: '/rafanutri/me/organizations', method: 'GET' })),
    );
  } catch (error) {
    console.error('getMyOrganizations: falha no Directus', directusErrorInfo(error));
    return null;
  }
});
