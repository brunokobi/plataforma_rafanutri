'use server';

import { revalidatePath } from 'next/cache';
import type { DossierData, ExportRow, IntegrityReport, ManualData, UnitLicenses } from '@/lib/uan/legal';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } | null;
const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
export type Result = { ok: true; id?: string } | { ok: false; message: string };
/** undefined = sem acesso/não existe; null = falha ou sem permissão; senão os dados. */
async function get<T>(path: string): Promise<T | null | undefined> {
  try {
    const r = await call(path);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as T) : null;
  } catch {
    return null;
  }
}
function fail(r: { json: Json }, fallback: string): Result {
  const e = r.json?.errors?.[0];
  const fields = e?.extensions?.fields;
  return { ok: false, message: (fields && Object.values(fields)[0]) || e?.message || fallback };
}
const period = (from?: string, to?: string) => (isDate(from) && isDate(to) ? `?from=${from}&to=${to}` : '');

export async function getLicenses(unitId: string) {
  return isUuid(unitId) ? get<UnitLicenses>(`/uan/units/${unitId}/licenses`) : undefined;
}
export async function getIntegrity(unitId: string, from?: string, to?: string) {
  return isUuid(unitId) ? get<IntegrityReport>(`/uan/units/${unitId}/integrity${period(from, to)}`) : undefined;
}
export async function getDossier(unitId: string, from?: string, to?: string) {
  return isUuid(unitId) ? get<DossierData>(`/uan/units/${unitId}/dossier${period(from, to)}`) : undefined;
}
export async function getManual(unitId: string) {
  return isUuid(unitId) ? get<ManualData>(`/uan/units/${unitId}/manual`) : undefined;
}
export async function getExports(unitId: string) {
  return isUuid(unitId) ? get<ExportRow[]>(`/uan/units/${unitId}/exports`) : undefined;
}

export interface LicenseInput { kind: string; title?: string; number?: string; issued_on?: string; valid_until?: string; provider?: string; notes?: string }
export async function createLicense(unitId: string, v: LicenseInput): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  try {
    const r = await call(`/uan/units/${unitId}/licenses`, 'POST', { ...v, issued_on: v.issued_on || null, valid_until: v.valid_until || null });
    if (r.status !== 201) return fail(r, 'Não foi possível registrar.');
    revalidatePath(`/app/uan/unidades/${unitId}/fiscalizacao`);
    return { ok: true, id: (r.json?.data as { id: string }).id };
  } catch {
    return { ok: false, message: 'Não foi possível registrar agora.' };
  }
}
export async function archiveLicense(unitId: string, id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Licença inválida.' };
  try {
    const r = await call(`/uan/licenses/${id}`, 'PATCH', { archived: true });
    if (r.status !== 200) return fail(r, 'Não foi possível arquivar.');
    revalidatePath(`/app/uan/unidades/${unitId}/fiscalizacao`);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível arquivar agora.' };
  }
}

/** Registra a emissão do PDF (chamado pela rota que gera o arquivo). */
export async function registerExport(unitId: string, body: { kind: 'manual' | 'dossier'; file_hash: string; period_from?: string; period_to?: string; includes?: unknown; integrity?: { total: number; divergent: number } }): Promise<{ ok: true; edition: number | null } | { ok: false; message: string }> {
  try {
    const r = await call(`/uan/units/${unitId}/exports`, 'POST', body);
    if (r.status !== 201) return fail(r, 'Não foi possível registrar a emissão.') as { ok: false; message: string };
    return { ok: true, edition: (r.json?.data as { edition: number | null }).edition };
  } catch {
    return { ok: false, message: 'Não foi possível registrar a emissão agora.' };
  }
}
