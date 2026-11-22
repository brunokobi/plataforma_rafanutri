'use server';

import { revalidatePath } from 'next/cache';
import type { AdminBilling, Billing, InvoiceDetail, UserNotificationPrefs } from './types';
import { call } from '@/lib/directus/rafanutri';
import { isUuid as isId } from '@/lib/validation/ids';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; fields?: Record<string, string> };

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await call(path, 'GET');
    return r.status === 200 ? (r.json?.data as T) : null;
  } catch {
    return null;
  }
}
async function send<T>(path: string, method: string, body: unknown, fallback: string, paths: string[] = []): Promise<Result<T>> {
  try {
    const r = await call(path, method, body);
    if (r.status === 200 || r.status === 201) {
      for (const p of paths) revalidatePath(p);
      return { ok: true, data: r.json?.data as T };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    const e = r.json?.errors?.[0];
    return { ok: false, message: e?.message ?? fallback, fields: e?.extensions?.fields };
  } catch {
    return { ok: false, message: fallback };
  }
}

// ── Consultório ─────────────────────────────────────────────────────────────
export async function getBilling(): Promise<Billing | null> {
  return get<Billing>('/billing');
}
export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  return isId(id) ? get<InvoiceDetail>(`/billing/invoices/${id}`) : null;
}
export async function subscribe(plan: string): Promise<Result<{ invoice?: { id: string }; scheduled?: boolean; from?: string }>> {
  return send('/billing/subscribe', 'POST', { plan }, 'Não foi possível assinar agora.', ['/app/configuracoes/plano']);
}
export async function reportPaid(id: string): Promise<Result> {
  if (!isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return send(`/billing/invoices/${id}/reported`, 'POST', {}, 'Não foi possível avisar agora.', [`/app/configuracoes/plano/fatura/${id}`, '/app/configuracoes/plano']);
}
export async function cancelSubscription(): Promise<Result<{ until?: string; canceled?: boolean }>> {
  return send('/billing/cancel', 'POST', {}, 'Não foi possível cancelar agora.', ['/app/configuracoes/plano']);
}
export async function resumeSubscription(): Promise<Result> {
  return send('/billing/resume', 'POST', {}, 'Não foi possível retomar agora.', ['/app/configuracoes/plano']);
}

// ── Telegram da pessoa logada (avisos da conta e da cobrança) ────────────────
export async function getMyAccountNotifications(): Promise<UserNotificationPrefs | null> {
  return get<UserNotificationPrefs>('/me/notifications');
}
export async function createMyAccountTelegramLink(): Promise<Result<{ url: string; expires_at: string }>> {
  return send('/me/notifications/telegram-link', 'POST', {}, 'Não foi possível gerar o link agora.');
}
export async function unlinkMyAccountTelegram(): Promise<Result> {
  return send('/me/notifications/telegram-unlink', 'POST', {}, 'Não foi possível desligar agora.', ['/app/configuracoes/avisos', '/app/admin/assinaturas']);
}

// ── Admin da plataforma ─────────────────────────────────────────────────────
export async function getAdminBilling(): Promise<AdminBilling | null> {
  return get<AdminBilling>('/admin/billing');
}
export async function saveBillingSettings(v: { pix_key: string; receiver_name: string; receiver_city: string; notify_email: string; grace_days: number }): Promise<Result> {
  return send('/admin/billing/settings', 'PUT', v, 'Não foi possível salvar agora.', ['/app/admin/assinaturas']);
}
export async function savePlanPrice(code: string, price: string, sellable: boolean): Promise<Result> {
  if (!/^[a-z_]{2,30}$/.test(code)) return { ok: false, message: 'Plano inválido.' };
  return send(`/admin/billing/plans/${code}`, 'PUT', { price, sellable }, 'Não foi possível salvar agora.', ['/app/admin/assinaturas']);
}
export async function confirmInvoice(id: string, paidOn?: string): Promise<Result<{ until: string }>> {
  if (!isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return send(`/admin/billing/invoices/${id}/confirm`, 'POST', paidOn ? { paid_on: paidOn } : {}, 'Não foi possível confirmar agora.', ['/app/admin/assinaturas']);
}
export async function voidInvoice(id: string): Promise<Result> {
  if (!isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return send(`/admin/billing/invoices/${id}/void`, 'POST', {}, 'Não foi possível cancelar agora.', ['/app/admin/assinaturas']);
}
