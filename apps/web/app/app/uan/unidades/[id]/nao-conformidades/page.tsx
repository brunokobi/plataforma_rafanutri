import { AlertCircle, AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { NewNc } from '@/components/uan/nc-forms';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/session';
import { NC_STATUS_LABEL, SEVERITY_LABEL, type NcSeverity } from '@/lib/uan/checklists';
import { getNcBoard } from '@/lib/uan/nc-actions';
import { boardColumns, isOverdue, NC_COLUMNS, NC_SOURCE_LABEL, type NcSource } from '@/lib/uan/nonconformities';

export const metadata: Metadata = { title: 'Não conformidades', robots: { index: false } };

const SEVERITIES: NcSeverity[] = ['critical', 'high', 'medium', 'low'];
const SOURCES: NcSource[] = ['checklist', 'temperature', 'manual'];
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

type Search = { gravidade?: string; origem?: string; atrasadas?: string };

export default async function NcBoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}/nao-conformidades`);
  const board = await getNcBoard(id);
  if (board === undefined) notFound();
  const severity = SEVERITIES.find((s) => s === sp.gravidade) ?? null;
  const source = SOURCES.find((s) => s === sp.origem) ?? null;
  const overdueOnly = sp.atrasadas === '1';
  const href = (patch: Search) => {
    const q = new URLSearchParams();
    const next = { gravidade: severity ?? undefined, origem: source ?? undefined, atrasadas: overdueOnly ? '1' : undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return `/app/uan/unidades/${id}/nao-conformidades${s ? `?${s}` : ''}`;
  };
  const chip = (active: boolean) => cn('rounded-full border px-3 py-1 text-sm', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted');
  const now = new Date();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {board === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar as não conformidades agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${id}`} className="text-sm text-muted-foreground hover:underline">← {board.unit.name}</Link>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Não conformidades</h1>
            </div>
            {board.can_open && <NewNc unitId={id} />}
            <nav aria-label="Filtros" className="flex flex-wrap gap-2">
              <Link href={href({ gravidade: undefined })} className={chip(!severity)} aria-current={!severity ? 'page' : undefined}>Todas</Link>
              {SEVERITIES.map((s) => <Link key={s} href={href({ gravidade: s })} className={chip(severity === s)} aria-current={severity === s ? 'page' : undefined}>{SEVERITY_LABEL[s]}</Link>)}
              <span className="mx-1 w-px self-stretch bg-border" aria-hidden="true" />
              {SOURCES.map((s) => <Link key={s} href={href({ origem: source === s ? undefined : s })} className={chip(source === s)} aria-current={source === s ? 'page' : undefined}>{NC_SOURCE_LABEL[s]}</Link>)}
              <Link href={href({ atrasadas: overdueOnly ? undefined : '1' })} className={chip(overdueOnly)} aria-current={overdueOnly ? 'page' : undefined}>Só atrasadas</Link>
            </nav>
            <div className="grid gap-4 lg:grid-cols-4">
              {(() => {
                const cols = boardColumns(board.items, { severity, source, overdueOnly }, now);
                return NC_COLUMNS.map((st) => (
                  <section key={st} aria-labelledby={`col-${st}`} className="space-y-2 rounded-2xl bg-muted/40 p-3">
                    <h2 id={`col-${st}`} className="flex items-center justify-between text-sm font-semibold">
                      {NC_STATUS_LABEL[st]}{st === 'closed' && <span className="font-normal text-muted-foreground"> (30 dias)</span>} <Badge variant="outline">{cols[st].length}</Badge>
                    </h2>
                    {cols[st].length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma.</p>
                    ) : (
                      <ul aria-label={NC_STATUS_LABEL[st]} className="space-y-2">
                        {cols[st].map((nc) => {
                          const late = isOverdue(nc, now);
                          return (
                            <li key={nc.id} className={cn('rounded-xl border bg-card p-3 text-sm', late ? 'border-destructive' : 'border-border')}>
                              <Link href={`/app/uan/nao-conformidades/${nc.id}`} className="font-medium hover:underline">{nc.title}</Link>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant={nc.severity === 'critical' ? 'destructive' : 'secondary'}>{SEVERITY_LABEL[nc.severity]}</Badge>
                                <Badge variant="outline">{NC_SOURCE_LABEL[nc.source]}</Badge>
                                {late && <Badge variant="destructive"><AlertTriangle className="size-3" /> Atrasada</Badge>}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {st === 'closed' && nc.closed_at ? `Fechada em ${when(nc.closed_at)}` : `Prazo ${when(nc.due_at)}`}
                                {nc.plan_count > 0 && ` · ${nc.plans_done}/${nc.plan_count} ações feitas`}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                ));
              })()}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
