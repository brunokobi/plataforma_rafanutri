'use server';

import { login } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, sessionCookies } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { env } from '@/lib/env';
import { validateStaffSignup, type ProductionUnit, type UanOrganization, type UnitDetail, type UnitInput, type UnitInvitePreview, type UnitRole } from '@/lib/uan/types';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> } | null;

async function call(path: string, method = 'GET', body?: unknown, auth = true): Promise<{ status: number; json: Json }> {
  const t = auth ? (await cookies()).get(ACCESS_COOKIE)?.value : undefined;
  if (auth && !t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Json };
}
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const isToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
const ROLES: UnitRole[] = ['technical_lead', 'manager', 'cook', 'stock_keeper', 'auditor'];
const errMsg = (r: { json: Json }, fallback: string) => r.json?.errors?.[0]?.message ?? fallback;

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

// ── Equipe da unidade (RN-220) ───────────────────────────────────────────

export type TeamResult = { ok: true } | { ok: false; message: string };

async function team(path: string, payload: unknown, unitId: string): Promise<{ status: number; json: Json } | { ok: false; message: string }> {
  try {
    const r = await call(path, 'POST', payload);
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 200 || r.status === 201) revalidatePath(`/app/uan/unidades/${unitId}`);
    return r;
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora. Tente novamente em instantes.' };
  }
}

/** Gera o link de convite (token devolvido uma única vez). */
export async function createUnitInvite(
  unitId: string,
  role: UnitRole,
  label: string,
): Promise<{ ok: true; link: string; expires_at: string } | { ok: false; message: string }> {
  if (!isUuid(unitId) || !ROLES.includes(role)) return { ok: false, message: 'Convite inválido.' };
  const r = await team(`/uan/units/${unitId}/invites`, { role, label: label.trim() || null }, unitId);
  if ('ok' in r) return r;
  if (r.status !== 201) return { ok: false, message: errMsg(r, 'Não foi possível criar o convite agora.') };
  const d = r.json?.data as { token: string; expires_at: string };
  return { ok: true, link: `${env.NEXT_PUBLIC_SITE_URL}/uan/convite/${d.token}`, expires_at: d.expires_at };
}

export async function revokeUnitInvite(unitId: string, inviteId: string): Promise<TeamResult> {
  if (!isUuid(unitId) || !isUuid(inviteId)) return { ok: false, message: 'Convite inválido.' };
  const r = await team(`/uan/units/${unitId}/invites/${inviteId}/revoke`, {}, unitId);
  if ('ok' in r) return r;
  return r.status === 200 ? { ok: true } : { ok: false, message: errMsg(r, 'Não foi possível cancelar o convite.') };
}

/** Troca o papel (newRole) ou remove da equipe (newRole null). */
export async function changeUnitMember(unitId: string, userId: string, role: UnitRole, newRole: UnitRole | null): Promise<TeamResult> {
  if (!isUuid(unitId) || !isUuid(userId) || !ROLES.includes(role) || (newRole !== null && !ROLES.includes(newRole))) {
    return { ok: false, message: 'Dados inválidos.' };
  }
  const r = await team(`/uan/units/${unitId}/members`, { user_id: userId, role, new_role: newRole }, unitId);
  if ('ok' in r) return r;
  return r.status === 200 ? { ok: true } : { ok: false, message: errMsg(r, 'Não foi possível alterar a equipe agora.') };
}

/** Página pública do convite. */
export async function openUnitInvite(token: string): Promise<{ ok: true; data: UnitInvitePreview } | { ok: false; reason: 'unavailable' | 'error' }> {
  if (!isToken(token)) return { ok: false, reason: 'unavailable' };
  try {
    const r = await call('/public/unit-invites/open', 'POST', { token }, false);
    if (r.status === 200) return { ok: true, data: r.json?.data as UnitInvitePreview };
    return { ok: false, reason: r.status === 410 || r.status === 404 ? 'unavailable' : 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export type StaffSignupResult = { ok: false; message: string; fields?: Record<string, string>; accountExists?: boolean };

/** Cria a conta pelo convite, entra e abre a unidade. */
export async function acceptUnitInviteWithSignup(
  token: string,
  input: { full_name: string; email: string; password: string; confirm: string },
): Promise<StaffSignupResult | undefined> {
  if (!isToken(token)) return { ok: false, message: 'Convite inválido.' };
  const fields = validateStaffSignup(input);
  if (Object.keys(fields).length) return { ok: false, message: 'Revise os campos destacados.', fields };
  const email = input.email.trim().toLowerCase();
  let unitId: string;
  try {
    const r = await call('/public/unit-invites/accept', 'POST', { token, full_name: input.full_name, email, password: input.password }, false);
    if (r.status === 409 && r.json?.errors?.[0]?.extensions?.code === 'ACCOUNT_EXISTS') {
      return { ok: false, message: errMsg(r, 'Já existe uma conta com este e-mail.'), accountExists: true };
    }
    if (r.status === 400) return { ok: false, message: 'Revise os campos destacados.', fields: r.json?.errors?.[0]?.extensions?.fields };
    if (r.status !== 201) return { ok: false, message: errMsg(r, 'Não foi possível criar seu acesso agora. Tente de novo em instantes.') };
    unitId = (r.json?.data as { unit_id: string }).unit_id;
  } catch {
    return { ok: false, message: 'Não foi possível criar seu acesso agora. Tente de novo em instantes.' };
  }
  try {
    const tokens = await directus().request(login({ email, password: input.password }, { mode: 'json' }));
    const store = await cookies();
    for (const c of sessionCookies(tokens)) store.set(c.name, c.value, c.options);
  } catch {
    redirect(`/login?next=/app/uan/unidades/${unitId}`);
  }
  redirect(`/app/uan/unidades/${unitId}`);
}

/** Conta já existente, logada, aceita o convite. */
export async function acceptUnitInviteLoggedIn(token: string): Promise<{ ok: true; unitId: string } | { ok: false; message: string }> {
  if (!isToken(token)) return { ok: false, message: 'Convite inválido.' };
  try {
    const r = await call('/unit-invites/accept', 'POST', { token });
    if (r.status === 200) {
      revalidatePath('/app', 'layout');
      return { ok: true, unitId: (r.json?.data as { unit_id: string }).unit_id };
    }
    if (r.status === 401) return { ok: false, message: 'Entre com a sua conta para aceitar o convite.' };
    return { ok: false, message: errMsg(r, 'Não foi possível aceitar o convite agora.') };
  } catch {
    return { ok: false, message: 'Não foi possível aceitar o convite agora.' };
  }
}
