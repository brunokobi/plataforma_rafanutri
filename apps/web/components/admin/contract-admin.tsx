'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createContract, createInvoice, setInvoiceStatus, setUanModule, updateContract, type AdminOrgDetail } from '@/lib/admin/actions';
import { brl } from '@/lib/uan/catalog';
import { CONTRACT_STATE_LABEL, INVOICE_STATUS_LABEL, invoiceStatus, PLAN_LABEL } from '@/lib/uan/contract';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';
const day = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const BILLING: Record<string, string> = { invoice: 'Fatura', pix: 'Pix', boleto: 'Boleto', card: 'Cartão' };

/** Contrato UAN da empresa: módulo, contratos (criar, encerrar) e faturas (emitir, dar baixa, cancelar). */
export function ContractAdmin({ data, today }: { data: AdminOrgDetail; today: string }) {
  const router = useRouter();
  const org = data.organization;
  const [c, setC] = useState({ plan: 'uan_quality', units_contracted: '1', monthly_price: '', starts_at: today, ends_at: '', billing_method: 'boleto', notes: '' });
  const [inv, setInv] = useState<Record<string, { period_start: string; period_end: string; due_on: string; amount: string; payment_url: string }>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string, after?: () => void) =>
    startTransition(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) return setMsg({ text: r.message ?? 'Não foi possível salvar.', error: true });
      setMsg({ text: done });
      after?.();
      router.refresh();
    });
  const monthStart = today.slice(0, 8) + '01';
  const monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <section aria-labelledby="modulo" className="flex flex-wrap items-center gap-3">
        <h2 id="modulo" className="font-semibold">Módulo UAN</h2>
        <Badge variant={org.uan ? 'default' : 'secondary'}>{org.uan ? 'Ligado' : 'Desligado'}</Badge>
        {org.uan && <Badge variant="outline">{CONTRACT_STATE_LABEL[data.state]} · {data.active_units} de {data.unit_limit} unidade(s) ativa(s)</Badge>}
        <Button type="button" size="sm" variant="outline" disabled={pending}
          onClick={() => { if (window.confirm(org.uan ? 'Desligar o módulo UAN? A empresa deixa de ver as unidades (os dados ficam).' : 'Ligar o módulo UAN para esta empresa?')) run(() => setUanModule(org.id, !org.uan), org.uan ? 'Módulo desligado.' : 'Módulo ligado.'); }}>
          {org.uan ? 'Desligar módulo' : 'Ligar módulo'}
        </Button>
      </section>

      <section aria-labelledby="contratos" className="space-y-3">
        <h2 id="contratos" className="font-display text-xl font-semibold">Contratos</h2>
        {data.contracts.length === 0 ? <p className="text-sm text-muted-foreground">Sem contrato: piloto de 1 unidade.</p> : (
          <ul aria-label="Contratos" className="space-y-3">
            {data.contracts.map((k) => {
              const f = inv[k.id] ?? { period_start: monthStart, period_end: monthEnd, due_on: '', amount: '', payment_url: '' };
              const set = (p: Partial<typeof f>) => setInv({ ...inv, [k.id]: { ...f, ...p } });
              const invoices = data.invoices.filter((i) => i.contract_id === k.id);
              return (
                <li key={k.id} className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>Plano {PLAN_LABEL[k.plan] ?? k.plan}</strong> · {k.units_contracted} unidade(s) · {brl(k.monthly_price_cents)}/mês · {BILLING[k.billing_method] ?? k.billing_method} · {k.ends_at ? `${day(k.starts_at)} a ${day(k.ends_at)}` : `desde ${day(k.starts_at)}, sem prazo`}</span>
                    {!k.ends_at || k.ends_at >= today ? (
                      <Button type="button" size="sm" variant="outline" disabled={pending}
                        onClick={() => { const end = window.prompt('Encerrar em (AAAA-MM-DD):', today); if (end) run(() => updateContract(org.id, k.id, { ends_at: end }), 'Contrato encerrado.'); }}>Encerrar</Button>
                    ) : (
                      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateContract(org.id, k.id, { ends_at: null }), 'Contrato reaberto (sem prazo).')}>Reabrir</Button>
                    )}
                  </div>
                  {invoices.length > 0 && (
                    <table className="w-full text-sm" aria-label={`Faturas do contrato de ${day(k.starts_at)}`}>
                      <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-1">Período</th><th className="py-1">Vencimento</th><th className="py-1 text-right">Valor</th><th className="py-1 text-right">Situação</th><th /></tr></thead>
                      <tbody>
                        {invoices.map((i) => {
                          const st = invoiceStatus(i, today);
                          return (
                            <tr key={i.id} className="border-b border-border/60">
                              <td className="py-1">{day(i.period_start)} a {day(i.period_end)}</td><td className="py-1">{day(i.due_on)}</td>
                              <td className="py-1 text-right">{brl(i.amount_cents)}</td>
                              <td className="py-1 text-right"><Badge variant={st === 'paid' ? 'outline' : st === 'overdue' ? 'destructive' : 'secondary'}>{INVOICE_STATUS_LABEL[st] ?? st}</Badge></td>
                              <td className="py-1 text-right">
                                {(i.status === 'open') && (
                                  <span className="flex justify-end gap-1">
                                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setInvoiceStatus(org.id, i.id, 'paid', today), 'Pagamento registrado.')}>Dar baixa</Button>
                                    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { if (window.confirm('Cancelar esta fatura?')) run(() => setInvoiceStatus(org.id, i.id, 'void'), 'Fatura cancelada.'); }}>Cancelar</Button>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <form aria-label={`Nova fatura do contrato de ${day(k.starts_at)}`} className="grid gap-2 sm:grid-cols-6 sm:items-end"
                    onSubmit={(e) => { e.preventDefault(); run(() => createInvoice(org.id, k.id, f), 'Fatura emitida.', () => setInv({ ...inv, [k.id]: { ...f, due_on: '', payment_url: '' } })); }}>
                    <div className="space-y-1"><Label htmlFor={`iv-s-${k.id}`} className="text-xs">De</Label><Input id={`iv-s-${k.id}`} type="date" value={f.period_start} onChange={(e) => set({ period_start: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor={`iv-e-${k.id}`} className="text-xs">Até</Label><Input id={`iv-e-${k.id}`} type="date" value={f.period_end} onChange={(e) => set({ period_end: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor={`iv-d-${k.id}`} className="text-xs">Vencimento</Label><Input id={`iv-d-${k.id}`} type="date" value={f.due_on} onChange={(e) => set({ due_on: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor={`iv-a-${k.id}`} className="text-xs">Valor (R$)</Label><Input id={`iv-a-${k.id}`} inputMode="decimal" placeholder={(k.monthly_price_cents / 100).toFixed(2).replace('.', ',')} value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor={`iv-u-${k.id}`} className="text-xs">Link de pagamento</Label><Input id={`iv-u-${k.id}`} placeholder="https://" value={f.payment_url} onChange={(e) => set({ payment_url: e.target.value })} /></div>
                    <Button type="submit" size="sm" disabled={pending}>Emitir fatura</Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <form aria-label="Novo contrato" className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3"
          onSubmit={(e) => { e.preventDefault(); run(() => createContract(org.id, c), 'Contrato criado.'); }}>
          <h3 className="font-semibold sm:col-span-3">Novo contrato</h3>
          <div className="space-y-1.5"><Label htmlFor="ct-plan">Plano</Label>
            <select id="ct-plan" className={SELECT} value={c.plan} onChange={(e) => setC({ ...c, plan: e.target.value })}>{Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ct-units">Unidades</Label><Input id="ct-units" inputMode="numeric" value={c.units_contracted} onChange={(e) => setC({ ...c, units_contracted: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-price">Mensalidade (R$)</Label><Input id="ct-price" inputMode="decimal" value={c.monthly_price} onChange={(e) => setC({ ...c, monthly_price: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-start">Início</Label><Input id="ct-start" type="date" value={c.starts_at} onChange={(e) => setC({ ...c, starts_at: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-end">Fim (opcional)</Label><Input id="ct-end" type="date" value={c.ends_at} onChange={(e) => setC({ ...c, ends_at: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-billing">Cobrança</Label>
            <select id="ct-billing" className={SELECT} value={c.billing_method} onChange={(e) => setC({ ...c, billing_method: e.target.value })}>{Object.entries(BILLING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="ct-notes">Observações</Label><Input id="ct-notes" maxLength={1000} value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} /></div>
          <div className="sm:col-span-3"><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Criar contrato</Button></div>
          {!org.uan && <p className="text-xs text-amber-700 dark:text-amber-400 sm:col-span-3">O módulo UAN está desligado: ligue o módulo para a empresa usar o contrato.</p>}
        </form>
      </section>
      {msg && <p role={msg.error ? 'alert' : 'status'} className={msg.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{msg.text}</p>}
    </div>
  );
}
