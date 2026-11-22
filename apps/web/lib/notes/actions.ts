'use server';

import { revalidatePath } from 'next/cache';
import type { ClinicalNote, NoteResult } from './schema';
import { call } from '@/lib/directus/rafanutri';
import { isUuid as isId } from '@/lib/validation/ids';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> };



function result(r: { status: number; json: Json }, patientId: string): NoteResult {
  if (r.status >= 200 && r.status < 300) {
    revalidatePath(`/app/pacientes/${patientId}/prontuario`);
    return { ok: true, id: (r.json?.data as { id?: string } | undefined)?.id };
  }
  if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  if (r.status === 404) return { ok: false, message: 'Evolução não encontrada.' };
  if (r.status === 400) return { ok: false, message: Object.values(r.json?.errors?.[0]?.extensions?.fields ?? {})[0] ?? 'Revise o texto.' };
  if (r.status === 409) return { ok: false, message: r.json?.errors?.[0]?.message ?? 'Esta evolução não pode ser alterada.' };
  return { ok: false, message: 'Não foi possível salvar a evolução agora.' };
}

async function run(fn: () => Promise<{ status: number; json: Json }>, patientId: string): Promise<NoteResult> {
  try {
    return result(await fn(), patientId);
  } catch {
    return { ok: false, message: 'Não foi possível salvar a evolução agora.' };
  }
}

/** Evoluções do paciente (mais recentes primeiro). Undefined = paciente não encontrado; null = falha. */
export async function listNotes(patientId: string): Promise<ClinicalNote[] | null | undefined> {
  if (!isId(patientId)) return undefined;
  try {
    const r = await call(`/patients/${patientId}/notes`, 'GET');
    if (r.status === 404) return undefined;
    return r.status === 200 ? ((r.json?.data as ClinicalNote[]) ?? []) : null;
  } catch {
    return null;
  }
}

/** Nova evolução (rascunho). Com `supersedesId`, é a retificação de uma evolução assinada. */
export async function createNote(patientId: string, body: string, opts: { supersedesId?: string; sign?: boolean } = {}): Promise<NoteResult> {
  if (!isId(patientId) || (opts.supersedesId !== undefined && !isId(opts.supersedesId))) return { ok: false, message: 'Pedido inválido.' };
  const created = await run(() => call(`/patients/${patientId}/notes`, 'POST', { body, supersedes_id: opts.supersedesId ?? null }), patientId);
  if (!created.ok || !opts.sign || !created.id) return created;
  const signed = await signNote(patientId, created.id);
  return signed.ok ? created : { ok: false, message: `Salva como rascunho, mas não foi assinada: ${signed.message}` };
}

export async function updateNote(patientId: string, id: string, body: string): Promise<NoteResult> {
  if (!isId(patientId) || !isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return run(() => call(`/notes/${id}`, 'PUT', { body }), patientId);
}

export async function signNote(patientId: string, id: string): Promise<NoteResult> {
  if (!isId(patientId) || !isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return run(() => call(`/notes/${id}/sign`, 'POST'), patientId);
}

export async function deleteNote(patientId: string, id: string): Promise<NoteResult> {
  if (!isId(patientId) || !isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return run(() => call(`/notes/${id}`, 'DELETE'), patientId);
}
