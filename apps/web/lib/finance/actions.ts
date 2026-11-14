'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { AppointmentPrefill, FinanceCategory, FinanceResult, FinanceSummary, ReceiptPayload, TransactionInput, TransactionList, TxKind } from './types';

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
const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await call(path);
    return r.status === 200 ? (r.json?.data as T) : null;
  } catch {
    return null;
  }
}

async function mutate(path: string, method: string, body: unknown, ok: number, fallback: string): Promise<FinanceResult> {
  try {
    const r = await call(path, method, body);
    if (r.status === ok) {
      revalidatePath('/app/financeiro');
      return { ok: true };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    if (r.status === 404) return { ok: false, message: 'Lançamento não encontrado.' };
    const e = r.json?.errors?.[0];
    const field = e?.extensions?.fields ? Object.values(e.extensions.fields)[0] : null;
    return { ok: false, message: field ?? e?.message ?? fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}

export async function getTransactions(from: string, to: string): Promise<TransactionList | null> {
  if (!isDate(from) || !isDate(to)) return null;
  return get<TransactionList>(`/finance/transactions?from=${from}&to=${to}`);
}

export async function getFinanceSummary(month: string): Promise<FinanceSummary | null> {
  return get<FinanceSummary>(`/finance/summary${/^\d{4}-\d{2}$/.test(month) ? `?month=${month}` : ''}`);
}

export async function getFinanceCategories(): Promise<FinanceCategory[] | null> {
  return get<FinanceCategory[]>('/finance/categories');
}

export async function getAppointmentPrefill(id: string): Promise<AppointmentPrefill | null> {
  return isUuid(id) ? get<AppointmentPrefill>(`/finance/appointment/${id}`) : null;
}

export async function createTransaction(input: TransactionInput): Promise<FinanceResult> {
  return mutate('/finance/transactions', 'POST', input, 201, 'Não foi possível salvar o lançamento agora.');
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<FinanceResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(`/finance/transactions/${id}`, 'PUT', input, 200, 'Não foi possível salvar o lançamento agora.');
}

export async function deleteTransaction(id: string): Promise<FinanceResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(`/finance/transactions/${id}`, 'DELETE', undefined, 200, 'Não foi possível excluir agora.');
}

export async function createFinanceCategory(kind: TxKind, name: string): Promise<{ ok: true; category: FinanceCategory } | { ok: false; message: string }> {
  try {
    const r = await call('/finance/categories', 'POST', { kind, name });
    if (r.status === 201) return { ok: true, category: r.json?.data as FinanceCategory };
    const e = r.json?.errors?.[0];
    return { ok: false, message: (e?.extensions?.fields ? Object.values(e.extensions.fields)[0] : null) ?? e?.message ?? 'Não foi possível criar a categoria agora.' };
  } catch {
    return { ok: false, message: 'Não foi possível criar a categoria agora.' };
  }
}

/** RN-055 — Emite (ou devolve o já emitido) o recibo de um recebimento pago. */
export async function issueReceipt(transactionId: string, payer?: { payer_name?: string; payer_cpf?: string }): Promise<{ ok: true; receiptId: string } | { ok: false; message: string }> {
  if (!isUuid(transactionId)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/finance/transactions/${transactionId}/receipt`, 'POST', payer ?? {});
    if (r.status === 200 || r.status === 201) {
      revalidatePath('/app/financeiro');
      return { ok: true, receiptId: (r.json?.data as ReceiptPayload).receipt.id };
    }
    const e = r.json?.errors?.[0];
    return { ok: false, message: (e?.extensions?.fields ? Object.values(e.extensions.fields)[0] : null) ?? e?.message ?? 'Não foi possível emitir o recibo agora.' };
  } catch {
    return { ok: false, message: 'Não foi possível emitir o recibo agora.' };
  }
}

export async function getReceipt(id: string): Promise<ReceiptPayload | null> {
  return isUuid(id) ? get<ReceiptPayload>(`/finance/receipts/${id}`) : null;
}
