export interface ServicePackage { id: string; name: string; sessions: number; price_cents: number; validity_days: number | null; active: boolean }
export type PatientPackageStatus = 'active' | 'finished' | 'expired' | 'cancelled';
export interface PatientPackage {
  id: string;
  name: string;
  sessions_total: number;
  sessions_used: number;
  price_cents: number;
  sold_at: string;
  expires_at: string | null;
  status: PatientPackageStatus;
  /** Datas (ISO) das consultas concluídas que usaram o pacote. */
  sessions: string[];
}
export interface PackageInput { name: string; sessions: number; price_cents: number; validity_days: number | null; active?: boolean }
export interface SaleInput { package_id: string; installments: number; first_due_date: string; paid_now: boolean; payment_method: string | null }
export type AgendaPackages = Record<string, { name: string; used: number; total: number }>;
export type PackageResult = { ok: true } | { ok: false; message: string };

export const PACKAGE_STATUS_LABEL: Record<PatientPackageStatus, string> = { active: 'Ativo', finished: 'Concluído', expired: 'Vencido', cancelled: 'Cancelado' };

/** Aviso da agenda: "Pacote X · sessão 3 de 3 (última)". `upcoming` = a consulta ainda vai consumir uma sessão. */
export function packageBadge(p: { name: string; used: number; total: number }, upcoming: boolean): { text: string; last: boolean } {
  const n = upcoming ? Math.min(p.used + 1, p.total) : p.used;
  const last = upcoming && p.used + 1 === p.total;
  return { text: `${p.name} · ${upcoming ? `sessão ${n} de ${p.total}` : `${p.used} de ${p.total} usadas`}`, last };
}
