'use server';

import { revalidatePath } from 'next/cache';
import type { Equipment, EquipmentDetail, EquipmentKind, FoodStage, TemperatureReading, UnitTemperatures } from '@/lib/uan/temperatures';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> } | null;

const FAIL = 'Sem conexão com o servidor. Tente de novo em instantes.';
type Fail = { ok: false; message: string; fields?: Record<string, string> };
const fail = (r: { status: number; json: Json }, fallback: string): Fail => ({
  ok: false,
  message: r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : (r.json?.errors?.[0]?.message ?? fallback),
  fields: r.json?.errors?.[0]?.extensions?.fields,
});

export async function getUnitTemperatures(unitId: string): Promise<UnitTemperatures | null | undefined> {
  if (!isUuid(unitId)) return undefined;
  try {
    const r = await call(`/uan/units/${unitId}/temperatures`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as UnitTemperatures) : null;
  } catch {
    return null;
  }
}

export async function getEquipment(id: string, days = 30): Promise<EquipmentDetail | null | undefined> {
  if (!isUuid(id)) return undefined;
  try {
    const r = await call(`/uan/equipment/${id}?days=${Math.min(90, Math.max(1, Math.round(days)))}`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as EquipmentDetail) : null;
  } catch {
    return null;
  }
}

export interface EquipmentInput {
  name: string;
  kind: EquipmentKind;
  min_temp: number | null;
  max_temp: number | null;
  reading_interval_hours: number;
  active?: boolean;
}

export async function createEquipment(unitId: string, input: EquipmentInput): Promise<{ ok: true; equipment: Equipment } | Fail> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  try {
    const r = await call(`/uan/units/${unitId}/equipment`, 'POST', input);
    if (r.status !== 201) return fail(r, 'Não foi possível cadastrar o equipamento.');
    revalidatePath(`/app/uan/unidades/${unitId}`);
    return { ok: true, equipment: r.json?.data as Equipment };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function updateEquipment(id: string, input: Partial<EquipmentInput>): Promise<{ ok: true } | Fail> {
  if (!isUuid(id)) return { ok: false, message: 'Equipamento inválido.' };
  try {
    const r = await call(`/uan/equipment/${id}`, 'PUT', input);
    if (r.status !== 200) return fail(r, 'Não foi possível salvar o equipamento.');
    revalidatePath(`/app/uan/equipamentos/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function recordTemperature(
  unitId: string,
  input: { client_id: string; value: number; corrective_action?: string | null } & ({ equipment_id: string } | { food_stage: FoodStage; food_name: string }),
): Promise<{ ok: true; reading: TemperatureReading } | Fail> {
  if (!isUuid(unitId) || !isUuid(input.client_id)) return { ok: false, message: 'Registro inválido.' };
  try {
    const r = await call(`/uan/units/${unitId}/temperatures`, 'POST', input);
    if (r.status !== 201 && r.status !== 200) return fail(r, 'Não foi possível registrar a temperatura.');
    revalidatePath(`/app/uan/unidades/${unitId}`);
    if ('equipment_id' in input) revalidatePath(`/app/uan/equipamentos/${input.equipment_id}`);
    return { ok: true, reading: r.json?.data as TemperatureReading };
  } catch {
    return { ok: false, message: FAIL };
  }
}
