'use server';

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { CostsData } from '@/lib/uan/costs';

const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Dados do painel de custos; undefined = sem acesso; null = falha (ou período inválido). */
export async function getCosts(unitId: string, from?: string, to?: string): Promise<CostsData | null | undefined> {
  if (!isUuid(unitId)) return undefined;
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return null;
  const q = new URLSearchParams();
  if (isDate(from)) q.set('from', from);
  if (isDate(to)) q.set('to', to);
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/uan/units/${unitId}/costs?${q}`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    if (res.status === 404) return undefined;
    if (!res.ok) return null;
    return ((await res.json()) as { data: CostsData }).data;
  } catch {
    return null;
  }
}
