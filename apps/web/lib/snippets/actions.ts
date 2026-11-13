'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

export interface Snippet {
  id: string;
  category: string;
  title: string;
  body: string;
  /** false = biblioteca da plataforma (somente leitura). */
  own: boolean;
}
export type SnippetResult = { ok: true; id?: string } | { ok: false; message: string; fields?: Record<string, string> };

async function call(path: string, init: { method: string; body?: unknown }) {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null as null | { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Biblioteca da plataforma + textos do consultório. Null se falhar. */
export async function listSnippets(): Promise<Snippet[] | null> {
  try {
    const r = await call('/snippets', { method: 'GET' });
    return r.status === 200 ? ((r.json?.data as Snippet[]) ?? []) : null;
  } catch {
    return null;
  }
}

const isId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

export async function saveSnippet(input: { category: string; title: string; body: string }, id?: string): Promise<SnippetResult> {
  if (id !== undefined && !isId(id)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(id ? `/snippets/${id}` : '/snippets', { method: id ? 'PUT' : 'POST', body: input });
    if (r.status === 200 || r.status === 201) {
      revalidatePath('/app/orientacoes');
      return { ok: true, id: (r.json?.data as { id: string } | undefined)?.id };
    }
    if (r.status === 400) return { ok: false, message: 'Revise os campos.', fields: r.json?.errors?.[0]?.extensions?.fields };
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 404) return { ok: false, message: 'Texto não encontrado.' };
    return { ok: false, message: 'Não foi possível salvar agora.' };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}

export async function deleteSnippet(id: string): Promise<SnippetResult> {
  if (!isId(id)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/snippets/${id}`, { method: 'DELETE' });
    if (r.status === 204) {
      revalidatePath('/app/orientacoes');
      return { ok: true };
    }
    return { ok: false, message: r.status === 404 ? 'Texto não encontrado.' : 'Não foi possível apagar agora.' };
  } catch {
    return { ok: false, message: 'Não foi possível apagar agora.' };
  }
}
