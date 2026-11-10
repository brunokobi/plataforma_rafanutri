import { readMe, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { directus } from './directus';
import { ACCESS_COOKIE } from './cookies';

export interface SessionUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

/** Usuário logado (ou null). O proxy já renovou o token se necessário. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const me = await directus().request(withToken(token, readMe({ fields: ['id', 'email', 'first_name', 'last_name'] })));
    return me as SessionUser;
  } catch {
    return null;
  }
});
