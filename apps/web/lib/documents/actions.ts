'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { ClinicalDocument, DocumentInput, DocumentPayload, DocumentResult, DocumentStatus, DocumentTemplate, PatientDocument } from './types';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> };

async function call(path: string, method = 'GET', body?: unknown): Promise<{ status: number; json: Json }> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
function fail(r: { status: number; json: Json }, fallback: string): DocumentResult {
  if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  if (r.status === 400) return { ok: false, message: r.json?.errors?.[0]?.message ?? 'Revise os campos.', fields: r.json?.errors?.[0]?.extensions?.fields };
  if (r.status === 404) return { ok: false, message: 'Documento ou paciente não encontrado.' };
  if (r.status === 409) return { ok: false, message: r.json?.errors?.[0]?.message ?? fallback };
  return { ok: false, message: fallback };
}
const path = (patientId: string) => `/app/pacientes/${patientId}/documentos`;

async function mutate(r: Promise<{ status: number; json: Json }>, okStatus: number, patientId: string | null, fallback: string): Promise<DocumentResult> {
  try {
    const res = await r;
    if (res.status === okStatus) {
      if (patientId) revalidatePath(path(patientId));
      return { ok: true };
    }
    return fail(res, fallback);
  } catch {
    return { ok: false, message: fallback };
  }
}

// ── Nutricionista ─────────────────────────────────────────────────────────

/** undefined = paciente não encontrado; null = falhou. */
export async function listDocuments(patientId: string): Promise<ClinicalDocument[] | null | undefined> {
  if (!isUuid(patientId)) return undefined;
  try {
    const r = await call(`/patients/${patientId}/documents`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as ClinicalDocument[]) : null;
  } catch {
    return null;
  }
}

export async function createDocument(patientId: string, input: DocumentInput, publish: boolean): Promise<DocumentResult> {
  if (!isUuid(patientId)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(call(`/patients/${patientId}/documents`, 'POST', { ...input, publish: publish === true }), 201, patientId, 'Não foi possível salvar agora.');
}

export async function updateDocument(patientId: string, id: string, input: DocumentInput & { status: DocumentStatus }): Promise<DocumentResult> {
  if (!isUuid(patientId) || !isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(call(`/documents/${id}`, 'PUT', input), 200, patientId, 'Não foi possível salvar agora.');
}

export async function deleteDocument(patientId: string, id: string): Promise<DocumentResult> {
  if (!isUuid(patientId) || !isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(call(`/documents/${id}`, 'DELETE'), 200, patientId, 'Não foi possível excluir agora.');
}

/** Documento + cabeçalho para o PDF do profissional (qualquer status). */
export async function getDocument(id: string): Promise<DocumentPayload | null> {
  if (!isUuid(id)) return null;
  try {
    const r = await call(`/documents/${id}?export=1`);
    return r.status === 200 ? (r.json?.data as DocumentPayload) : null;
  } catch {
    return null;
  }
}

export async function listDocumentTemplates(): Promise<DocumentTemplate[] | null> {
  try {
    const r = await call('/document-templates');
    return r.status === 200 ? (r.json?.data as DocumentTemplate[]) : null;
  } catch {
    return null;
  }
}

export async function createDocumentTemplate(patientId: string, input: Omit<DocumentInput, 'document_date'>): Promise<DocumentResult> {
  return mutate(call('/document-templates', 'POST', input), 201, isUuid(patientId) ? patientId : null, 'Não foi possível salvar o modelo agora.');
}

export async function deleteDocumentTemplate(patientId: string, id: string): Promise<DocumentResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(call(`/document-templates/${id}`, 'DELETE'), 200, isUuid(patientId) ? patientId : null, 'Não foi possível excluir o modelo agora.');
}

// ── Paciente ──────────────────────────────────────────────────────────────

export async function getMyDocuments(c?: string): Promise<{ patient_id: string | null; documents: PatientDocument[] } | null> {
  try {
    const r = await call(`/me/patient/documents${isUuid(c) ? `?c=${c}` : ''}`);
    return r.status === 200 ? (r.json?.data as { patient_id: string | null; documents: PatientDocument[] }) : null;
  } catch {
    return null;
  }
}

/** Só publicados, do registro ativo ligado à conta. */
export async function getMyDocument(id: string): Promise<DocumentPayload | null> {
  if (!isUuid(id)) return null;
  try {
    const r = await call(`/me/patient/documents/${id}`);
    return r.status === 200 ? (r.json?.data as DocumentPayload) : null;
  } catch {
    return null;
  }
}
