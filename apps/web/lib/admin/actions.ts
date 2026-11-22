'use server';

import { revalidatePath } from 'next/cache';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

export interface AdminOrg { id: string; name: string; type: string; modules: string[]; created_at: string; owner_email: string | null; active_units: number; contract_state: 'active' | 'read_only' | 'ended' | 'none' | null; unit_limit: number | null }
export interface AdminOrgDetail {
  organization: { id: string; name: string; modules: string[]; uan: boolean };
  state: 'active' | 'read_only' | 'ended' | 'none';
  unit_limit: number;
  active_units: number;
  contracts: Array<{ id: string; plan: string; units_contracted: number; monthly_price_cents: number; starts_at: string; ends_at: string | null; billing_method: string; notes: string | null; created_at: string }>;
  invoices: Array<{ id: string; contract_id: string; period_start: string; period_end: string; amount_cents: number; due_on: string; status: string; paid_at: string | null; payment_url: string | null }>;
}
export type Result = { ok: true } | { ok: false; message: string };
async function send(path: string, method: string, body: unknown, ok: number, orgId: string): Promise<Result> {
  try {
    const r = await call(path, method, body);
    if (r.status !== ok) {
      const e = r.json?.errors?.[0];
      return { ok: false, message: (e?.extensions?.fields && Object.values(e.extensions.fields)[0]) || e?.message || 'Não foi possível salvar.' };
    }
    revalidatePath(`/app/admin/empresas/${orgId}`);
    revalidatePath('/app/admin');
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}

/** null = não é admin (ou falhou). */
export async function adminOrgs(q = ''): Promise<AdminOrg[] | null> {
  try {
    const r = await call(`/admin/uan/organizations${q ? `?q=${encodeURIComponent(q.slice(0, 80))}` : ''}`);
    return r.status === 200 ? (r.json?.data as AdminOrg[]) : null;
  } catch {
    return null;
  }
}
export async function adminOrg(id: string): Promise<AdminOrgDetail | null> {
  if (!isUuid(id)) return null;
  try {
    const r = await call(`/admin/uan/organizations/${id}`);
    return r.status === 200 ? (r.json?.data as AdminOrgDetail) : null;
  } catch {
    return null;
  }
}
export async function setUanModule(orgId: string, enabled: boolean) {
  return isUuid(orgId) ? send(`/admin/uan/organizations/${orgId}/module`, 'POST', { enabled }, 200, orgId) : { ok: false as const, message: 'Empresa inválida.' };
}
export async function createContract(orgId: string, v: Record<string, string | null>) {
  return isUuid(orgId) ? send(`/admin/uan/organizations/${orgId}/contracts`, 'POST', v, 201, orgId) : { ok: false as const, message: 'Empresa inválida.' };
}
export async function updateContract(orgId: string, id: string, v: Record<string, string | null>) {
  return isUuid(id) ? send(`/admin/uan/contracts/${id}`, 'PATCH', v, 200, orgId) : { ok: false as const, message: 'Contrato inválido.' };
}
export async function createInvoice(orgId: string, contractId: string, v: Record<string, string>) {
  return isUuid(contractId) ? send(`/admin/uan/contracts/${contractId}/invoices`, 'POST', v, 201, orgId) : { ok: false as const, message: 'Contrato inválido.' };
}
export async function setInvoiceStatus(orgId: string, id: string, status: 'paid' | 'void' | 'open', paidOn?: string) {
  return isUuid(id) ? send(`/admin/uan/invoices/${id}`, 'PATCH', { status, paid_on: paidOn }, 200, orgId) : { ok: false as const, message: 'Fatura inválida.' };
}
