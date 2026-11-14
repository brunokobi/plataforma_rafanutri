'use server';

import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import { type AuditFilters, type AuditPage, auditQuery } from './types';

export type AuditResult = { ok: true; page: AuditPage } | { ok: false; status: number };

/** Página da auditoria do consultório (só o owner; os demais recebem 403). */
export async function getAuditLog(filters: AuditFilters): Promise<AuditResult> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { ok: false, status: 401 };
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/audit${auditQuery(filters)}`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: 'no-store',
    });
    if (res.status !== 200) return { ok: false, status: res.status };
    return { ok: true, page: (await res.json()) as AuditPage };
  } catch {
    return { ok: false, status: 500 };
  }
}
