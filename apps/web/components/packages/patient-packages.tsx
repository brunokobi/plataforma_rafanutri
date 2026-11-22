'use client';

import { Loader2, Package, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCents } from '@/lib/finance/money';
import { PAYMENT_LABEL, type PaymentMethod } from '@/lib/finance/types';
import { cancelPatientPackage, sellPackage } from '@/lib/packages/actions';
import { PACKAGE_STATUS_LABEL, type PackageResult, type PatientPackage, type ServicePackage } from '@/lib/packages/types';

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const todayISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** RN-054 — Pacotes do paciente: vender (à vista ou parcelado) e acompanhar as sessões. */
export function PatientPackages({ patientId, list, catalog, archived }: { patientId: string; list: PatientPackage[] | null; catalog: ServicePackage[] | null; archived: boolean }) {
  const [selling, setSelling] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const active = (catalog ?? []).filter((p) => p.active);
  const [pkgId, setPkgId] = useState('');
  const [installments, setInstallments] = useState('1');
  const [firstDue, setFirstDue] = useState(todayISO());
  const [paidNow, setPaidNow] = useState(true);
  const [method, setMethod] = useState<PaymentMethod | ''>('pix');
  const chosen = active.find((p) => p.id === pkgId);

  function run(fn: () => Promise<PackageResult>, ok: string) {
    setFeedback(null);
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, text: ok } : { ok: false, text: r.message });
      if (r.ok) setSelling(false);
    });
  }

  return (
    <section aria-labelledby="pacotes-paciente" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Package className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="pacotes-paciente" className="font-display text-lg font-semibold">Pacotes</h2>
        {!archived && !selling && active.length > 0 && <Button type="button" size="sm" className="ml-auto" onClick={() => { setSelling(true); setFeedback(null); }}>Vender pacote</Button>}
      </div>
      {catalog !== null && active.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum pacote no catálogo. <Link href="/app/financeiro/pacotes" className="font-medium text-primary hover:underline">Criar pacote</Link></p>
      )}
      {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}

      {selling && (
        <form aria-label="Vender pacote" className="space-y-3 rounded-xl border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pkgId) return setFeedback({ ok: false, text: 'Escolha o pacote.' });
            run(() => sellPackage(patientId, { package_id: pkgId, installments: Number(installments), first_due_date: firstDue, paid_now: paidNow, payment_method: method || null }), 'Pacote vendido: parcelas lançadas no financeiro.');
          }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sale-pkg">Pacote</Label>
              <select id="sale-pkg" value={pkgId} onChange={(e) => setPkgId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">Escolha…</option>
                {active.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.sessions} {p.sessions === 1 ? 'sessão' : 'sessões'} · {formatCents(p.price_cents)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-installments">Parcelas</Label>
              <select id="sale-installments" value={installments} onChange={(e) => setInstallments(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x${chosen ? ` de ${formatCents(Math.floor(chosen.price_cents / n))}` : ''}`}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-first">{installments === '1' ? 'Vencimento' : 'Primeira parcela'}</Label>
              <Input id="sale-first" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-method">Forma de pagamento</Label>
              <select id="sale-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">Não informar</option>
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((k) => <option key={k} value={k}>{PAYMENT_LABEL[k]}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} /> {installments === '1' ? 'Já foi pago' : 'Primeira parcela já paga'}</label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSelling(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Confirmar venda</Button>
          </div>
        </form>
      )}

      {list === null ? (
        <p className="text-sm text-destructive">Não foi possível carregar os pacotes agora.</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pacote vendido para este paciente.</p>
      ) : (
        <ul className="space-y-2" aria-label="Pacotes do paciente">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{PACKAGE_STATUS_LABEL[p.status]}</span></p>
                <p className="text-sm text-muted-foreground">
                  {p.sessions_used} de {p.sessions_total} sessões usadas · {formatCents(p.price_cents)} · vendido em {br(p.sold_at)}{p.expires_at ? ` · vence em ${br(p.expires_at)}` : ''}
                </p>
                <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" role="img" aria-label={`${p.sessions_used} de ${p.sessions_total} sessões usadas`}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.sessions_used / p.sessions_total) * 100}%` }} />
                </div>
              </div>
              {p.status === 'active' && !archived && (
                <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Cancelar pacote ${p.name}`}
                  onClick={() => { if (window.confirm(`Cancelar o pacote "${p.name}"? As parcelas em aberto são canceladas; as pagas ficam.`)) run(() => cancelPatientPackage(patientId, p.id), 'Pacote cancelado.'); }}>
                  <X className="size-4" /> Cancelar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
