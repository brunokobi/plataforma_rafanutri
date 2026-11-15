import { AlertCircle, AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/session';
import { getCompliance } from '@/lib/uan/checklist-actions';
import { COMPONENT_LABEL, COMPONENT_ORDER, indexLevel, LEVEL_LABEL, pct, pendingCount, rankUnits, type UnitCompliance } from '@/lib/uan/compliance';

export const metadata: Metadata = { title: 'Painel de conformidade', robots: { index: false } };

const PERIODS = [7, 30, 90];
const LEVEL = {
  good: { icon: CheckCircle2, cls: 'text-emerald-700 dark:text-emerald-400' },
  attention: { icon: CircleAlert, cls: 'text-amber-700 dark:text-amber-400' },
  critical: { icon: AlertTriangle, cls: 'text-destructive' },
} as const;

function IndexTile({ u }: { u: UnitCompliance }) {
  const level = indexLevel(u.index);
  if (!level) return <p className="text-sm text-muted-foreground">Sem dados no período</p>;
  const L = LEVEL[level];
  return (
    <p className="flex items-baseline gap-2">
      <span className="font-display text-4xl font-semibold tabular-nums">{pct(u.index!)}</span>
      <span className={cn('inline-flex items-center gap-1 text-sm font-medium', L.cls)}><L.icon className="size-4" aria-hidden="true" /> {LEVEL_LABEL[level]}</span>
    </p>
  );
}

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan/conformidade');
  const { dias } = await searchParams;
  const days = PERIODS.includes(Number(dias)) ? Number(dias) : 30;
  const data = await getCompliance(days);

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-5 sm:py-10">
        <div className="space-y-2">
          <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← UAN e Qualidade</Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Painel de conformidade</h1>
          <p className="text-sm text-muted-foreground">
            Índice dos últimos {days} dias: agenda cumprida (30%), pontuação dos checklists (30%), temperaturas no limite (20%) e não
            conformidades no prazo (20%). O que não tem dados fica de fora e os pesos se redistribuem.
          </p>
          <nav aria-label="Período" className="flex gap-2">
            {PERIODS.map((p) => (
              <Link key={p} href={`/app/uan/conformidade?dias=${p}`} aria-current={p === days ? 'page' : undefined}
                className={cn('rounded-full border px-3 py-1 text-sm', p === days ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
                {p} dias
              </Link>
            ))}
          </nav>
        </div>

        {data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível calcular o painel agora.</AlertDescription></Alert>
        ) : data.organizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma unidade para mostrar.</p>
        ) : (
          data.organizations.map((o) => {
            const ranked = rankUnits(o.units);
            return (
              <section key={o.id} aria-labelledby={`org-${o.id}`} className="space-y-4">
                <h2 id={`org-${o.id}`} className="font-display text-2xl font-semibold tracking-tight">{o.name}</h2>
                {ranked.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma unidade ativa.</p>
                ) : (
                  <ul aria-label={`Unidades de ${o.name}`} className="grid gap-4 md:grid-cols-2">
                    {ranked.map((u) => {
                      const pending = pendingCount(u);
                      return (
                        <li key={u.id} className="space-y-4 rounded-2xl border border-border bg-card p-5">
                          <div className="flex items-start justify-between gap-2">
                            <Link href={`/app/uan/unidades/${u.id}`} className="font-semibold hover:underline">{u.name}</Link>
                          </div>
                          <IndexTile u={u} />
                          <dl className="space-y-2" aria-label={`Componentes do índice de ${u.name}`}>
                            {COMPONENT_ORDER.map((k) => {
                              const v = u.components[k];
                              return (
                                <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                                  <dt className="text-muted-foreground">{COMPONENT_LABEL[k]}</dt>
                                  <dd className="tabular-nums">{v === undefined ? '—' : pct(v)}</dd>
                                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                    {v !== undefined && <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, v)}%` }} />}
                                  </div>
                                </div>
                              );
                            })}
                          </dl>
                          <p className="text-xs text-muted-foreground">
                            {u.counts.runs_completed} checklist(s) concluído(s) · {u.counts.scheduled_done}/{u.counts.scheduled} da agenda · {u.counts.readings} leitura(s) de temperatura
                          </p>
                          {pending > 0 ? (
                            <ul aria-label={`Pendências de ${u.name}`} className="space-y-1 text-sm">
                              {u.counts.nc_overdue > 0 && <li><Link href={`/app/uan/unidades/${u.id}/nao-conformidades?atrasadas=1`} className="text-destructive underline">{u.counts.nc_overdue} não conformidade(s) atrasada(s)</Link></li>}
                              {u.counts.checklists_overdue_today > 0 && <li><Link href={`/app/uan/unidades/${u.id}`} className="text-destructive underline">{u.counts.checklists_overdue_today} checklist(s) atrasado(s) hoje</Link></li>}
                              {u.counts.equipment_overdue > 0 && <li><Link href={`/app/uan/unidades/${u.id}`} className="text-amber-700 underline dark:text-amber-400">{u.counts.equipment_overdue} equipamento(s) sem leitura no prazo</Link></li>}
                            </ul>
                          ) : (
                            <p className="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden="true" /> Nada pendente agora</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
