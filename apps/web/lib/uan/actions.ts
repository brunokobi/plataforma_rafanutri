'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { ProductionUnit, UanOrganization, UnitDetail, UnitInput } from '@/lib/uan/types';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } | null;

async function call(path: string, method = 'GET', body?: unknown): Promise<{ status: number; json: Json }> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Json };
}
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

/** Empresas com UAN em que o usuário atua, com as unidades que ele vê. Null se falhar. */
export async function getUanContext(): Promise<UanOrganization[] | null> {
  try {
    const r = await call('/uan/context');
    return r.status === 200 ? ((r.json?.data as UanOrganization[]) ?? []) : null;
  } catch {
    return null;
  }
}

/** Unidade com papéis e equipe; undefined = não existe ou sem acesso; null = falha. */
export async function getUnit(id: string): Promise<UnitDetail | null | undefined> {
  if (!isUuid(id)) return undefined;
  try {
    const r = await call(`/uan/units/${id}`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as UnitDetail) : null;
  } catch {
    return null;
  }
}

export type UnitResult = { ok: true; unit: ProductionUnit } | { ok: false; message: string; fields?: Record<string, string> };

function body(input: UnitInput) {
  return {
    name: input.name,
    kind: input.kind,
    cnpj: input.cnpj ?? '',
    address: input.address ?? '',
    city: input.city ?? '',
    state: input.state ?? '',
    geo_lat: input.geo_lat?.trim() || null,
    geo_lng: input.geo_lng?.trim() || null,
    geo_radius_m: input.geo_radius_m?.trim() ? Number(input.geo_radius_m) : null,
    sanitary_license: input.sanitary_license ?? '',
    sanitary_license_expires_at: input.sanitary_license_expires_at || null,
    ...(input.active === undefined ? {} : { active: input.active }),
  };
}

async function save(path: string, method: string, payload: unknown): Promise<UnitResult> {
  try {
    const r = await call(path, method, payload);
    if (r.status === 200 || r.status === 201) {
      revalidatePath('/app/uan', 'layout');
      return { ok: true, unit: r.json?.data as ProductionUnit };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    const e = r.json?.errors?.[0];
    return { ok: false, message: e?.message ?? 'Não foi possível salvar agora.', fields: e?.extensions?.fields };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora. Tente novamente em instantes.' };
  }
}

export async function createUnit(organizationId: string, input: UnitInput): Promise<UnitResult> {
  if (!isUuid(organizationId)) return { ok: false, message: 'Empresa inválida.' };
  return save('/uan/units', 'POST', { ...body(input), organization_id: organizationId });
}

export async function updateUnit(id: string, input: UnitInput): Promise<UnitResult> {
  if (!isUuid(id)) return { ok: false, message: 'Unidade inválida.' };
  return save(`/uan/units/${id}`, 'PUT', body(input));
}
