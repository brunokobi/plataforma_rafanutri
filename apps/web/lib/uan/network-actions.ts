'use server';

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { MonthlyReport, NetworkData } from '@/lib/uan/network';
import { isUuid } from '@/lib/validation/ids';

async function get<T>(path: string): Promise<T | null | undefined> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return null;
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    if (res.status === 404) return undefined;
    return res.ok ? ((await res.json()).data as T) : null;
  } catch {
    return null;
  }
}
const monthQ = (m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? `?month=${m}` : '');

export async function getNetwork(orgId: string, month?: string) {
  return isUuid(orgId) ? get<NetworkData>(`/uan/organizations/${orgId}/network${monthQ(month)}`) : undefined;
}
export async function getMonthly(unitId: string, month?: string) {
  return isUuid(unitId) ? get<MonthlyReport>(`/uan/units/${unitId}/monthly${monthQ(month)}`) : undefined;
}
