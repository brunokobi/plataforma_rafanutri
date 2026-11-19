'use server';

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { ContractData } from '@/lib/uan/contract';

/** undefined = não existe ou sem acesso; null = falha ou não é o owner. */
export async function getContract(orgId: string): Promise<ContractData | null | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return undefined;
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return null;
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/uan/organizations/${orgId}/contract`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    if (res.status === 404) return undefined;
    return res.ok ? ((await res.json()).data as ContractData) : null;
  } catch {
    return null;
  }
}
