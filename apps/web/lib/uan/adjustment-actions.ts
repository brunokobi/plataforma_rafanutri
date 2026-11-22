'use server';

import { revalidatePath } from 'next/cache';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

export interface SheetAdjustments {
  can_edit: boolean;
  adjustments: Array<{ sheet_root_id: string; name: string; portion_factor: number; notes: string | null; updated_at: string }>;
  sheets: Array<{ root_id: string; name: string }>;
}

export async function getSheetAdjustments(unitId: string): Promise<SheetAdjustments | null> {
  if (!isUuid(unitId)) return null;
  try {
    const r = await call(`/uan/units/${unitId}/sheet-adjustments`);
    return r.status === 200 ? (r.json?.data as SheetAdjustments) : null;
  } catch {
    return null;
  }
}
export async function saveSheetAdjustment(unitId: string, v: { sheet_root_id: string; portion_factor: string | null; notes?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  try {
    const r = await call(`/uan/units/${unitId}/sheet-adjustments`, 'PUT', v);
    if (r.status !== 200) {
      const e = r.json?.errors?.[0];
      return { ok: false, message: (e?.extensions?.fields && Object.values(e.extensions.fields)[0]) || e?.message || 'Não foi possível salvar.' };
    }
    revalidatePath(`/app/uan/unidades/${unitId}/cardapios`);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}
