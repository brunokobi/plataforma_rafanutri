'use server';

import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';
import { MAX_BODY, type ChatMessage, type Conversation, type PatientChat, type ProChat, type SendResult } from './types';

type Cursor = { after?: string; before?: string };
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/;

function query(c: string | null | undefined, cur: Cursor = {}): string {
  const q = new URLSearchParams();
  if (c && isUuid(c)) q.set('c', c);
  if (cur.after && ISO.test(cur.after)) q.set('after', cur.after);
  else if (cur.before && ISO.test(cur.before)) q.set('before', cur.before);
  const s = q.toString();
  return s ? `?${s}` : '';
}

function sendError(r: { status: number; json: { errors?: Array<{ message: string }> } | null }): SendResult {
  const message = r.json?.errors?.[0]?.message;
  if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.', retry: false };
  if (r.status === 400 || r.status === 409 || r.status === 429) return { ok: false, message: message ?? 'Não foi possível enviar.', retry: r.status === 429 };
  return { ok: false, message: 'Sem conexão com o servidor. Toque para tentar de novo.', retry: true };
}

const validBody = (body: string) => typeof body === 'string' && body.trim().length > 0 && body.length <= MAX_BODY;

// ── Paciente ──────────────────────────────────────────────────────────────────────────────

export async function getMyChat(c?: string | null, cur: Cursor = {}): Promise<PatientChat | null> {
  const r = await call(`/me/patient/messages${query(c, cur)}`, 'GET', undefined, true, {}, 15_000);
  return r.status === 200 ? (r.json?.data as PatientChat) : null;
}

export async function sendMyMessage(c: string | null, body: string): Promise<SendResult> {
  if (!validBody(body)) return { ok: false, message: 'Escreva uma mensagem.', retry: false };
  const r = await call('/me/patient/messages', 'POST', { c: c && isUuid(c) ? c : undefined, body }, true, {}, 15_000);
  return r.status === 201 ? { ok: true, message: r.json?.data as ChatMessage } : sendError(r);
}

export async function getMyUnread(): Promise<number> {
  const r = await call('/me/patient/messages/unread', 'GET', undefined, true, {}, 8_000);
  return r.status === 200 ? Number(r.json?.data?.count ?? 0) : 0;
}

// ── Nutricionista ─────────────────────────────────────────────────────────────────────────

export async function getConversations(q?: string): Promise<{ enabled: boolean; conversations: Conversation[] } | null> {
  const s = q?.trim() ? `?q=${encodeURIComponent(q.trim().slice(0, 80))}` : '';
  const r = await call(`/messages/conversations${s}`, 'GET', undefined, true, {}, 15_000);
  return r.status === 200 ? (r.json?.data as { enabled: boolean; conversations: Conversation[] }) : null;
}

export async function getProChat(patientId: string, cur: Cursor = {}): Promise<ProChat | null> {
  if (!isUuid(patientId)) return null;
  const r = await call(`/patients/${patientId}/messages${query(null, cur)}`, 'GET', undefined, true, {}, 15_000);
  return r.status === 200 ? (r.json?.data as ProChat) : null;
}

export async function sendProMessage(patientId: string, body: string): Promise<SendResult> {
  if (!isUuid(patientId)) return { ok: false, message: 'Pedido inválido.', retry: false };
  if (!validBody(body)) return { ok: false, message: 'Escreva uma mensagem.', retry: false };
  const r = await call(`/patients/${patientId}/messages`, 'POST', { body }, true, {}, 15_000);
  return r.status === 201 ? { ok: true, message: r.json?.data as ChatMessage } : sendError(r);
}

export async function getProUnread(): Promise<number> {
  const r = await call('/messages/unread', 'GET', undefined, true, {}, 8_000);
  return r.status === 200 ? Number(r.json?.data?.count ?? 0) : 0;
}

export async function setMessagesEnabled(enabled: boolean): Promise<{ ok: boolean; enabled?: boolean }> {
  const r = await call('/messages/settings', 'POST', { enabled: enabled === true }, true, {}, 15_000);
  return r.status === 200 ? { ok: true, enabled: r.json?.data?.enabled === true } : { ok: false };
}
