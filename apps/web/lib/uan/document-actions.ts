'use server';

import { revalidatePath } from 'next/cache';
import type { DocDetail, UnitDocuments, UnitTrainings } from '@/lib/uan/documents';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

export type Result = { ok: true; id?: string } | { ok: false; message: string };
async function get<T>(path: string): Promise<T | null | undefined> {
  try {
    const r = await call(path);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as T) : null;
  } catch {
    return null;
  }
}
async function send(path: string, method: string, body: unknown, fallback: string, revalidate: string[]): Promise<Result> {
  try {
    const r = await call(path, method, body);
    if (r.status !== 200 && r.status !== 201) {
      const e = r.json?.errors?.[0];
      const f = e?.extensions?.fields;
      return { ok: false, message: r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : ((f && Object.values(f)[0]) || e?.message || fallback) };
    }
    for (const p of revalidate) revalidatePath(p, 'layout');
    return { ok: true, id: (r.json?.data as { id?: string } | undefined)?.id };
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor. Tente de novo em instantes.' };
  }
}

export async function getUnitDocuments(unitId: string): Promise<UnitDocuments | null | undefined> {
  return isUuid(unitId) ? get<UnitDocuments>(`/uan/units/${unitId}/documents`) : undefined;
}
export async function getDocument(id: string): Promise<DocDetail | null | undefined> {
  return isUuid(id) ? get<DocDetail>(`/uan/documents/${id}`) : undefined;
}
export async function getTrainings(unitId: string): Promise<UnitTrainings | null | undefined> {
  return isUuid(unitId) ? get<UnitTrainings>(`/uan/units/${unitId}/trainings`) : undefined;
}
export async function createDocument(unitId: string, input: { title: string; kind: string; code: string | null; body_md: string; review_every_months: number }): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  return send(`/uan/units/${unitId}/documents`, 'POST', input, 'Não foi possível criar o documento.', [`/app/uan/unidades/${unitId}`]);
}
export async function saveDraft(id: string, input: { body_md: string; change_summary: string }): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Documento inválido.' };
  return send(`/uan/documents/${id}/draft`, 'PUT', input, 'Não foi possível salvar o rascunho.', [`/app/uan/documentos/${id}`]);
}
export async function approveDocument(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Documento inválido.' };
  return send(`/uan/documents/${id}/approve`, 'POST', {}, 'Não foi possível aprovar.', [`/app/uan/documentos/${id}`, '/app/uan']);
}
export async function acknowledgeDocument(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Documento inválido.' };
  return send(`/uan/documents/${id}/acknowledge`, 'POST', {}, 'Não foi possível registrar a ciência.', [`/app/uan/documentos/${id}`, '/app/uan']);
}
export async function createTraining(unitId: string, input: { topic: string; held_on: string; hours: string; instructor: string; notes: string; attendee_ids: string[]; other_names: string[] }): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  return send(`/uan/units/${unitId}/trainings`, 'POST', input, 'Não foi possível registrar o treinamento.', [`/app/uan/unidades/${unitId}/treinamentos`]);
}
