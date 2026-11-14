'use server';

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { Indicators } from './types';

/** RN-064 — Indicadores do mês (e do anterior). null se falhar. */
export async function getIndicators(month?: string, nutritionist?: string): Promise<Indicators | null> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return null;
  const q = new URLSearchParams();
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) q.set('month', month);
  if (nutritionist && /^[0-9a-f-]{36}$/i.test(nutritionist)) q.set('nutritionist', nutritionist);
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/dashboard${q.size ? `?${q}` : ''}`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const j = (await res.json()) as { data: Indicators };
    const num = (v: unknown) => Number(v ?? 0);
    const fix = (x: Indicators['current']) => ({ ...x, revenue_cents: num(x.revenue_cents), avg_ticket_cents: num(x.avg_ticket_cents), no_show_rate: num(x.no_show_rate) });
    return { ...j.data, current: fix(j.data.current), previous: fix(j.data.previous), receivable_cents: num(j.data.receivable_cents), overdue_cents: num(j.data.overdue_cents) };
  } catch {
    return null;
  }
}
