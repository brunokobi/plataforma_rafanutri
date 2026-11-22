'use server';

import { revalidatePath } from 'next/cache';
import type { BookingInput, BookingRequest, BookingResult, PublicPractice, PublicProfileConfig, PublicProfileData, PublicSlots } from './types';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> };
const isSlug = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s);

const errOf = (j: Json, fallback: string) => {
  const e = j?.errors?.[0];
  return { message: e?.message ?? fallback, fields: e?.extensions?.fields };
};

// ── Público (sem login) ───────────────────────────────────────────────────

export async function getPublicPractice(slug: string): Promise<PublicPractice | null> {
  if (!isSlug(slug)) return null;
  try {
    const r = await call(`/public/practices/${slug}`, 'GET', undefined, false);
    return r.status === 200 ? (r.json?.data as PublicPractice) : null;
  } catch {
    return null;
  }
}

export async function getPublicSlots(slug: string, from?: string): Promise<PublicSlots | null> {
  if (!isSlug(slug)) return null;
  const q = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? `?from=${from}&days=7` : '?days=7';
  try {
    const r = await call(`/public/practices/${slug}/slots${q}`, 'GET', undefined, false);
    return r.status === 200 ? (r.json?.data as PublicSlots) : null;
  } catch {
    return null;
  }
}

export async function bookPublic(slug: string, input: BookingInput): Promise<BookingResult> {
  if (!isSlug(slug)) return { ok: false, message: 'Página não encontrada.' };
  try {
    const r = await call(`/public/practices/${slug}/book`, 'POST', input, false);
    if (r.status === 201) return { ok: true, status: (r.json?.data as { status: 'pending' | 'confirmed' }).status };
    if (r.status === 429) return { ok: false, message: 'Muitos pedidos agora. Tente de novo mais tarde.' };
    const e = errOf(r.json, 'Não foi possível agendar agora. Tente de novo em instantes.');
    return { ok: false, message: e.fields ? Object.values(e.fields)[0] ?? e.message : e.message, fields: e.fields };
  } catch {
    return { ok: false, message: 'Não foi possível agendar agora. Tente de novo em instantes.' };
  }
}

// ── Consultório ───────────────────────────────────────────────────────────

export async function getPublicProfileConfig(orgId: string): Promise<PublicProfileData | null> {
  if (!isUuid(orgId)) return null;
  try {
    const r = await call(`/practices/${orgId}/public-profile`);
    return r.status === 200 ? (r.json?.data as PublicProfileData) : null;
  } catch {
    return null;
  }
}

export async function savePublicProfile(orgId: string, input: PublicProfileConfig): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(orgId)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/practices/${orgId}/public-profile`, 'PUT', input);
    if (r.status === 200) {
      revalidatePath('/app/configuracoes/pagina-publica');
      return { ok: true };
    }
    if (r.status === 404) return { ok: false, message: 'Só o responsável (owner) do consultório muda a página pública.' };
    const e = errOf(r.json, 'Não foi possível salvar agora.');
    return { ok: false, message: e.fields ? Object.values(e.fields)[0] ?? e.message : e.message };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}

export async function listBookingRequests(): Promise<BookingRequest[] | null> {
  try {
    const r = await call('/booking-requests');
    return r.status === 200 ? (r.json?.data as BookingRequest[]) : null;
  } catch {
    return null;
  }
}

export async function decideBookingRequest(id: string, confirm: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/booking-requests/${id}/${confirm ? 'confirm' : 'decline'}`, 'POST', {});
    if (r.status === 200) {
      revalidatePath('/app/agenda');
      return { ok: true };
    }
    return { ok: false, message: errOf(r.json, 'Não foi possível agora.').message };
  } catch {
    return { ok: false, message: 'Não foi possível agora.' };
  }
}
