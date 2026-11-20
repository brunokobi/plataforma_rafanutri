import { AlertCircle, Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getUanContext } from '@/lib/uan/actions';
import { brl } from '@/lib/uan/catalog';
import { localToday } from '@/lib/uan/costs';
import { monthLabel, overTarget, shiftMonth } from '@/lib/uan/network';
import { getNetwork } from '@/lib/uan/network-actions';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Painel da rede', robots: { index: false } };
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const int = (n: number) => n.toLocaleString('pt-BR');

/** RN-229 — Painel da rede: indicadores do mês de cada unidade, lado a lado. */
export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ empresa?: string; mes?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan/rede');
  if (!sp.empresa) {
    const orgs = await getUanContext();
    redirect(orgs?.[0] ? `/app/uan/rede?empresa=${orgs[0].id}` : '/app/uan');
  }
  const d = await getNetwork(sp.empresa, sp.mes);
  if (d === undefined) notFound();
  const base = `/app/uan/rede?empresa=${sp.empresa}`;
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Só o responsável, o gestor ou o RT veem o painel da rede.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← UAN e Qualidade</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Painel da rede</h1>
              <p className="text-sm text-muted-foreground">{d.organization.name}</p>
            </div>
            <nav aria-label="Mês" className="flex flex-wrap items-center gap-3 text-sm">
              <Link href={`${base}&mes=${shiftMonth(d.month, -1)}`} className="underline">← {monthLabel(shiftMonth(d.month, -1))}</Link>
              <span className="font-semibold first-letter:uppercase">{monthLabel(d.month)}</span>
              {d.month < localToday().slice(0, 7) && <Link href={`${base}&mes=${shiftMonth(d.month, 1)}`} className="underline">{monthLabel(shiftMonth(d.month, 1))} →</Link>}
            </nav>
            <section aria-label="Totais da rede" className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Custo realizado</p><p className="mt-1 text-xl font-semibold">{brl(d.totals.cost_cents)}</p></div>
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Refeições servidas</p><p className="mt-1 text-xl font-semibold">{int(d.totals.meals_served)}</p><p className="text-xs text-muted-foreground">previstas: {int(d.totals.meals_planned)}</p></div>
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Custo por refeição</p><p className="mt-1 text-xl font-semibold" aria-label="Custo por refeição da rede">{d.totals.cost_per_meal_cents === null ? '—' : brl(d.totals.cost_per_meal_cents)}</p></div>
            </section>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[60rem] text-sm" aria-label="Indicadores por unidade">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-2 font-medium">Unidade</th><th className="p-2 text-right font-medium">Custo</th><th className="p-2 text-right font-medium">Refeições</th>
                    <th className="p-2 text-right font-medium">Custo/refeição</th><th className="p-2 text-right font-medium">Sobra</th><th className="p-2 text-right font-medium">Resto-ingesta</th>
                    <th className="p-2 text-right font-medium">Satisfação</th><th className="p-2 text-right font-medium">Conformidade</th><th className="p-2 text-right font-medium">NCs abertas</th><th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {d.units.map((u) => (
                    <tr key={u.id} className="border-b border-border/60">
                      <th scope="row" className="p-2 text-left font-medium"><Link href={`/app/uan/unidades/${u.id}`} className="hover:underline">{u.name}</Link></th>
                      <td className="p-2 text-right tabular-nums">{brl(u.cost_cents)}{u.cost_estimated_missing && <span className="block text-xs text-amber-700 dark:text-amber-400">sem preço em parte</span>}</td>
                      <td className="p-2 text-right tabular-nums">{int(u.meals_served)}</td>
                      <td className={cn('p-2 text-right tabular-nums', overTarget(u) && 'font-semibold text-destructive')}>{u.cost_per_meal_cents === null ? '—' : brl(u.cost_per_meal_cents)}{u.cost_target_cents !== null && <span className="block text-xs text-muted-foreground">teto {brl(u.cost_target_cents)}</span>}</td>
                      <td className="p-2 text-right tabular-nums">{pct(u.waste.leftover_pct)}</td>
                      <td className="p-2 text-right tabular-nums">{pct(u.waste.plate_pct)}{u.waste.plate_g_per_meal !== null && <span className="block text-xs text-muted-foreground">{u.waste.plate_g_per_meal} g/refeição</span>}</td>
                      <td className="p-2 text-right tabular-nums">{u.satisfaction.avg === null ? '—' : `${u.satisfaction.avg.toLocaleString('pt-BR')} ★`}<span className="block text-xs text-muted-foreground">{u.satisfaction.responses} resposta(s)</span></td>
                      <td className="p-2 text-right tabular-nums">{u.compliance_index === null ? '—' : u.compliance_index.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                      <td className={cn('p-2 text-right tabular-nums', u.nc_overdue > 0 && 'text-destructive')}>{u.nc_open}{u.nc_overdue > 0 && <span className="block text-xs">{u.nc_overdue} atrasada(s)</span>}</td>
                      <td className="p-2 text-right"><a href={`/app/uan/unidades/${u.id}/relatorio?mes=${d.month}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"><Download className="size-3.5" aria-hidden="true" /> Relatório</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Custo realizado = retiradas do estoque para produção, pelo custo do lote (ou pelo preço vigente). Sobra = sobra limpa ÷ produzido; resto-ingesta = resto ÷ (produzido − sobra). Conformidade dos últimos dias do período.</p>
          </>
        )}
      </main>
    </div>
  );
}
