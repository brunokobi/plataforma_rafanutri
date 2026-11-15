import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/session';
import { brl } from '@/lib/uan/catalog';
import { costPanel, localToday } from '@/lib/uan/costs';
import { getCosts } from '@/lib/uan/costs-actions';

export const metadata: Metadata = { title: 'Custos', robots: { index: false } };
const day = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const money = (c: number | null) => (c === null ? '—' : brl(c));

function Deviation({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', up ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400')}>
      <Icon className="size-4" aria-hidden="true" /> {up ? '+' : ''}{pct.toLocaleString('pt-BR')}%
    </span>
  );
}

export default async function CostsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ de?: string; ate?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}/custos`);
  const today = localToday();
  const from = sp.de ?? `${today.slice(0, 8)}01`;
  const to = sp.ate ?? today;
  const d = await getCosts(id, from, to);
  if (d === undefined) notFound();
  const p = d ? costPanel(d) : null;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-5 sm:py-10">
        <div className="space-y-3">
          <Link href={`/app/uan/unidades/${id}`} className="text-sm text-muted-foreground hover:underline">← {d?.unit.name ?? 'Unidade'}</Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Custos</h1>
          <form className="flex flex-wrap items-end gap-3" action={`/app/uan/unidades/${id}/custos`}>
            <div className="space-y-1"><Label htmlFor="c-de" className="text-xs">De</Label><Input id="c-de" name="de" type="date" defaultValue={from} className="w-40" /></div>
            <div className="space-y-1"><Label htmlFor="c-ate" className="text-xs">Até</Label><Input id="c-ate" name="ate" type="date" defaultValue={to} className="w-40" /></div>
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">Atualizar</button>
            <span className="text-xs text-muted-foreground">Até 31 dias.</span>
          </form>
        </div>

        {!d || !p ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível calcular os custos (período de até 31 dias; só owner, gestor, RT e estoquista).</AlertDescription></Alert>
        ) : (
          <>
            <dl aria-label="Resumo do período" className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-border bg-card p-4"><dt className="text-sm text-muted-foreground">Custo por refeição planejado</dt><dd className="font-display text-2xl font-semibold tabular-nums" aria-label="Custo por refeição planejado">{money(p.plannedPerCapita)}</dd></div>
              <div className="rounded-2xl border border-border bg-card p-4"><dt className="text-sm text-muted-foreground">Custo por refeição realizado</dt><dd className="font-display text-2xl font-semibold tabular-nums" aria-label="Custo por refeição realizado">{money(p.actualPerCapita)}</dd></div>
              <div className="rounded-2xl border border-border bg-card p-4"><dt className="text-sm text-muted-foreground">Diferença</dt><dd className="font-display text-2xl font-semibold" aria-label="Diferença do custo por refeição"><Deviation pct={p.deviation} /></dd></div>
              <div className="rounded-2xl border border-border bg-card p-4"><dt className="text-sm text-muted-foreground">Refeições previstas × servidas</dt><dd className="font-display text-2xl font-semibold tabular-nums">{p.plannedMeals.toLocaleString('pt-BR')} × {p.actualMeals.toLocaleString('pt-BR')}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Planejado: cardápio aprovado × comensais previstos × adesão × fichas técnicas, pelo preço vigente. {d.criterion}
              {p.estimatedLines > 0 && ` ${p.estimatedLines} retirada(s) sem custo no lote foram valorizadas pelo preço vigente.`}
              {p.missingCostLines > 0 && ` ${p.missingCostLines} sem preço nenhum (contam como zero).`}
            </p>

            <section aria-labelledby="desvio" className="space-y-3">
              <h2 id="desvio" className="font-display text-xl font-semibold">O que mais explica o desvio</h2>
              {p.top.length === 0 ? <p className="text-sm text-muted-foreground">Sem diferença por produto no período.</p> : (
                <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                  <table className="w-full min-w-[30rem] text-left text-sm tabular-nums">
                    <caption className="sr-only">Produtos com maior diferença entre planejado e realizado</caption>
                    <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Insumo</th><th className="p-2 text-right font-medium">Planejado</th><th className="p-2 text-right font-medium">Realizado</th><th className="p-2 text-right font-medium">Diferença</th></tr></thead>
                    <tbody>{p.top.map((t) => <tr key={t.key} className="border-t border-border"><td className="p-2">{t.name}</td><td className="p-2 text-right">{brl(t.plannedCents)}</td><td className="p-2 text-right">{brl(t.actualCents)}</td><td className={cn('p-2 text-right font-medium', t.diffCents > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400')}>{t.diffCents > 0 ? '+' : '−'}{brl(Math.abs(t.diffCents))}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="por-dia" className="space-y-3">
              <h2 id="por-dia" className="font-display text-xl font-semibold">Dia a dia</h2>
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full min-w-[36rem] text-left text-sm tabular-nums">
                  <caption className="sr-only">Custo por refeição planejado e realizado por dia</caption>
                  <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Dia</th><th className="p-2 text-right font-medium">Previstas</th><th className="p-2 text-right font-medium">Servidas</th><th className="p-2 text-right font-medium">Planejado/refeição</th><th className="p-2 text-right font-medium">Realizado/refeição</th><th className="p-2 text-right font-medium">Diferença</th></tr></thead>
                  <tbody>
                    {p.days.filter((x) => x.plannedMeals || x.actualMeals || x.actualCents).map((x) => (
                      <tr key={x.day} className="border-t border-border"><td className="p-2">{day(x.day)}</td><td className="p-2 text-right">{x.plannedMeals || '—'}</td><td className="p-2 text-right">{x.actualMeals || '—'}</td><td className="p-2 text-right">{money(x.plannedPerCapita)}</td><td className="p-2 text-right">{money(x.actualPerCapita)}</td><td className="p-2 text-right"><Deviation pct={x.deviation} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              {([['abc', 'Curva ABC do consumo', p.abc], ['abc-fornecedor', 'Curva ABC por fornecedor', p.abcSuppliers]] as const).map(([key, title, rows]) => (
                <section key={key} aria-labelledby={key} className="space-y-3">
                  <h2 id={key} className="font-display text-xl font-semibold">{title}</h2>
                  {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem retiradas para produção no período.</p> : (
                    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                      <table className="w-full text-left text-sm tabular-nums">
                        <caption className="sr-only">{title}</caption>
                        <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Classe</th><th className="p-2 font-medium">Item</th><th className="p-2 text-right font-medium">Valor</th><th className="p-2 text-right font-medium">Acumulado</th></tr></thead>
                        <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-border"><td className="p-2"><Badge variant={r.abc === 'A' ? 'default' : r.abc === 'B' ? 'secondary' : 'outline'}>{r.abc}</Badge></td><td className="p-2">{r.name}</td><td className="p-2 text-right">{brl(r.valueCents)}</td><td className="p-2 text-right">{r.cumulativePct.toLocaleString('pt-BR')}%</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
