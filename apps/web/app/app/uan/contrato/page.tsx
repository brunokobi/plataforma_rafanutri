import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/auth/session';
import { getUanContext } from '@/lib/uan/actions';
import { brl } from '@/lib/uan/catalog';
import { CONTRACT_STATE_LABEL, INVOICE_STATUS_LABEL, invoiceStatus, PLAN_LABEL } from '@/lib/uan/contract';
import { getContract } from '@/lib/uan/contract-actions';
import { localToday } from '@/lib/uan/costs';

export const metadata: Metadata = { title: 'Contrato da UAN', robots: { index: false } };
const day = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const BILLING: Record<string, string> = { invoice: 'Fatura', pix: 'Pix', boleto: 'Boleto', card: 'Cartão' };

/** RN-124 — Contrato Enterprise: situação, unidades contratadas e faturas (só o responsável pela empresa). */
export default async function ContractPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan/contrato');
  if (!empresa) {
    const orgs = await getUanContext();
    redirect(orgs?.[0] ? `/app/uan/contrato?empresa=${orgs[0].id}` : '/app/uan');
  }
  const d = await getContract(empresa);
  if (d === undefined) notFound();
  const today = localToday();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Só o responsável pela empresa vê o contrato.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← UAN e Qualidade</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Contrato da UAN</h1>
              <p className="text-sm text-muted-foreground">{d.organization.name}</p>
            </div>
            <section aria-labelledby="situacao" className="grid gap-3 sm:grid-cols-3">
              <h2 id="situacao" className="sr-only">Situação</h2>
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Situação</p><p className="mt-1 font-semibold" aria-label="Situação do contrato">{CONTRACT_STATE_LABEL[d.state]}</p>{d.read_only_until && <p className="text-xs text-muted-foreground">Consulta até {day(d.read_only_until)}</p>}</div>
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Unidades ativas</p><p className="mt-1 font-semibold">{d.active_units} de {d.unit_limit}</p></div>
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Mensalidade vigente</p><p className="mt-1 font-semibold">{d.contracts[0] ? brl(d.contracts[0].monthly_price_cents) : '—'}</p></div>
            </section>
            {(d.state === 'read_only' || d.state === 'ended') && <p role="alert" className="rounded-2xl border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">Sem contrato vigente, a equipe só consulta os registros. Fale com a Rafanutri para renovar.</p>}
            <section aria-labelledby="contratos" className="space-y-2">
              <h2 id="contratos" className="font-display text-xl font-semibold">Contratos</h2>
              {d.contracts.length === 0 ? <p className="text-sm text-muted-foreground">Sem contrato: a empresa está no piloto (1 unidade).</p> : (
                <ul className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
                  {d.contracts.map((c) => (
                    <li key={c.id} className="flex flex-wrap justify-between gap-2 p-3">
                      <span>Plano {PLAN_LABEL[c.plan] ?? c.plan} · {c.units_contracted} unidade(s) · {brl(c.monthly_price_cents)}/mês · {BILLING[c.billing_method] ?? c.billing_method}</span>
                      <span className="text-muted-foreground">{day(c.starts_at)} a {c.ends_at ? day(c.ends_at) : 'sem prazo'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="faturas" className="space-y-2">
              <h2 id="faturas" className="font-display text-xl font-semibold">Faturas</h2>
              {d.invoices.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma fatura emitida ainda.</p> : (
                <table className="w-full text-sm" aria-label="Faturas">
                  <thead><tr className="border-b border-border text-left"><th className="py-2">Período</th><th className="py-2">Vencimento</th><th className="py-2 text-right">Valor</th><th className="py-2 text-right">Situação</th></tr></thead>
                  <tbody>
                    {d.invoices.map((i) => {
                      const st = invoiceStatus(i, today);
                      return (
                        <tr key={i.id} className="border-b border-border/60">
                          <td className="py-2">{day(i.period_start)} a {day(i.period_end)}</td>
                          <td className="py-2">{day(i.due_on)}</td>
                          <td className="py-2 text-right">{brl(i.amount_cents)}</td>
                          <td className="py-2 text-right">
                            <Badge variant={st === 'paid' ? 'outline' : st === 'overdue' ? 'destructive' : 'secondary'}>{INVOICE_STATUS_LABEL[st] ?? st}</Badge>
                            {st !== 'paid' && st !== 'void' && i.payment_url && <a href={i.payment_url} target="_blank" rel="noreferrer" className="ml-2 underline">Pagar</a>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <p className="text-xs text-muted-foreground">A cobrança (boleto ou Pix) é emitida pela Rafanutri; o pagamento aparece aqui quando confirmado.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
