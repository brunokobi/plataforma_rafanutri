'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { PatientRecipeDetail, PatientRecipeRow, RecipeSummary, VisibleRecipe } from './types';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> };
export type RecipeActionResult = { ok: true } | { ok: false; message: string };

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
const isFoodId = (id: unknown): id is string => typeof id === 'string' && /^\d+$/.test(id);
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const msg = (j: Json, fallback: string) => j?.errors?.[0]?.extensions?.fields?.image ?? j?.errors?.[0]?.message ?? fallback;

// ── Nutricionista ─────────────────────────────────────────────────────────

export async function listRecipes(): Promise<RecipeSummary[] | null> {
  try {
    const r = await call('/recipes');
    return r.status === 200 ? (r.json?.data as RecipeSummary[]) : null;
  } catch {
    return null;
  }
}

/** Foto em data URL (o navegador já reduziu). */
export async function uploadRecipeImage(id: string, dataUrl: string): Promise<RecipeActionResult> {
  if (!isFoodId(id) || typeof dataUrl !== 'string' || dataUrl.length > 900_000) return { ok: false, message: 'Foto grande demais. Use uma imagem menor.' };
  try {
    const r = await call(`/recipes/${id}/image`, 'POST', { image: dataUrl });
    if (r.status === 200) {
      revalidatePath('/app/receitas');
      return { ok: true };
    }
    return { ok: false, message: msg(r.json, 'Não foi possível salvar a foto agora.') };
  } catch {
    return { ok: false, message: 'Não foi possível salvar a foto agora.' };
  }
}

export async function removeRecipeImage(id: string): Promise<RecipeActionResult> {
  if (!isFoodId(id)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/recipes/${id}/image`, 'DELETE');
    if (r.status === 200) revalidatePath('/app/receitas');
    return r.status === 200 ? { ok: true } : { ok: false, message: 'Não foi possível remover a foto agora.' };
  } catch {
    return { ok: false, message: 'Não foi possível remover a foto agora.' };
  }
}

export async function listPatientRecipes(patientId: string): Promise<PatientRecipeRow[] | null> {
  if (!isUuid(patientId)) return null;
  try {
    const r = await call(`/patients/${patientId}/recipes`);
    return r.status === 200 ? (r.json?.data as PatientRecipeRow[]) : null;
  } catch {
    return null;
  }
}

export async function sendRecipe(patientId: string, recipeId: string, note: string): Promise<RecipeActionResult> {
  if (!isUuid(patientId) || !isFoodId(recipeId)) return { ok: false, message: 'Escolha uma receita.' };
  try {
    const r = await call(`/patients/${patientId}/recipes`, 'POST', { recipe_id: recipeId, note: String(note ?? '').slice(0, 500) });
    if (r.status === 201) {
      revalidatePath(`/app/pacientes/${patientId}`);
      return { ok: true };
    }
    return { ok: false, message: msg(r.json, 'Não foi possível enviar a receita agora.') };
  } catch {
    return { ok: false, message: 'Não foi possível enviar a receita agora.' };
  }
}

export async function unsendRecipe(patientId: string, recipeId: string): Promise<RecipeActionResult> {
  if (!isUuid(patientId) || !isFoodId(recipeId)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/patients/${patientId}/recipes/${recipeId}`, 'DELETE');
    if (r.status === 200) revalidatePath(`/app/pacientes/${patientId}`);
    return r.status === 200 ? { ok: true } : { ok: false, message: 'Não foi possível retirar a receita agora.' };
  } catch {
    return { ok: false, message: 'Não foi possível retirar a receita agora.' };
  }
}

// ── Paciente ──────────────────────────────────────────────────────────────

export async function getMyRecipes(c?: string): Promise<{ patient_id: string | null; recipes: VisibleRecipe[] } | null> {
  try {
    const r = await call(`/me/patient/recipes${isUuid(c) ? `?c=${c}` : ''}`);
    return r.status === 200 ? (r.json?.data as { patient_id: string | null; recipes: VisibleRecipe[] }) : null;
  } catch {
    return null;
  }
}

export async function getMyRecipe(id: string, c?: string): Promise<PatientRecipeDetail | null | 'error'> {
  if (!isFoodId(id)) return null;
  try {
    const r = await call(`/me/patient/recipes/${id}${isUuid(c) ? `?c=${c}` : ''}`);
    if (r.status === 404) return null;
    return r.status === 200 ? (r.json?.data as PatientRecipeDetail) : 'error';
  } catch {
    return 'error';
  }
}
