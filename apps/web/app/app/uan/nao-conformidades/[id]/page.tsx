import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { CloseNc, PlanActions, PlanForm } from '@/components/uan/nc-forms';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { today } from '@/lib/appointments/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { NC_STATUS_LABEL, SEVERITY_LABEL } from '@/lib/uan/checklists';
import { getNc } from '@/lib/uan/nc-actions';
import { formatCents, isOverdue, NC_SOURCE_LABEL, ncPhotoUrl, planLate } from '@/lib/uan/nonconformities';

export const metadata: Metadata = { title: 'Não conformidade', robots: { index: false } };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—');
const day = (d: string) => d.split('-').reverse().join('/');

export default async function NcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/nao-conformidades/${id}`);
  const d = await getNc(id);
  if (d === undefined) notFound();
  const todayDate = today();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar a não conformidade agora.</AlertDescription></Alert>
        ) : (
          <>
            <div className="space-y-2">
              <Link href={`/app/uan/unidades/${d.unit.id}/nao-conformidades`} className="text-sm text-muted-foreground hover:underline">← Não conformidades de {d.unit.name}</Link>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{d.nc.title}</h1>
              <div className="flex flex-wrap gap-1">
                <Badge variant={d.nc.status === 'closed' ? 'default' : 'secondary'}>{NC_STATUS_LABEL[d.nc.status]}</Badge>
                <Badge variant={d.nc.severity === 'critical' ? 'destructive' : 'secondary'}>{SEVERITY_LABEL[d.nc.severity]}</Badge>
                <Badge variant="outline">{NC_SOURCE_LABEL[d.nc.source]}</Badge>
                {isOverdue(d.nc) && <Badge variant="destructive"><AlertTriangle className="size-3" /> Atrasada</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                Aberta em {when(d.nc.opened_at)}{d.nc.opened_by_name ? ` por ${d.nc.opened_by_name}` : ''} · prazo {when(d.nc.due_at)}
              </p>
              {d.nc.run_id && <Link href={`/app/uan/checklists/${d.nc.run_id}`} className="text-sm text-primary underline">Ver o checklist de origem (item {d.nc.answer_position})</Link>}
              {d.nc.equipment && <Link href={`/app/uan/equipamentos/${d.nc.equipment.id}`} className="block text-sm text-primary underline">Ver o histórico de {d.nc.equipment.name}</Link>}
            </div>

            {(d.nc.description || d.nc.has_photo) && (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
                {d.nc.description && <p className="whitespace-pre-line">{d.nc.description}</p>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.nc.has_photo && <img src={ncPhotoUrl(d.nc.id, 'opening')} alt="Foto da não conformidade" className="max-h-64 rounded-lg border border-border object-contain" />}
              </div>
            )}

            <section aria-labelledby="planos" className="space-y-3">
              <h2 id="planos" className="font-display text-xl font-semibold">Plano de ação</h2>
              {d.plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma ação planejada ainda.{d.can_plan ? ' Registre o 5W2H: o quê, por quê, onde, quando, quem, como e quanto.' : ''}</p>
              ) : (
                <ol aria-label="Ações" className="space-y-3">
                  {d.plans.map((p) => (
                    <li key={p.id} className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-medium">{p.what}</p>
                        {p.status === 'done' ? <Badge><CheckCircle2 className="size-3" /> Feita</Badge> : planLate(p, todayDate) ? <Badge variant="destructive">Vencida</Badge> : <Badge variant="secondary">Pendente</Badge>}
                      </div>
                      <dl className="grid gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-2">
                        {p.why && <div><dt className="inline font-medium text-foreground">Por quê: </dt><dd className="inline">{p.why}</dd></div>}
                        {p.where_ && <div><dt className="inline font-medium text-foreground">Onde: </dt><dd className="inline">{p.where_}</dd></div>}
                        <div><dt className="inline font-medium text-foreground">Quando: </dt><dd className="inline">{day(p.due_date)}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Quem: </dt><dd className="inline">{p.who_name ?? '—'}</dd></div>
                        {p.how && <div className="sm:col-span-2"><dt className="inline font-medium text-foreground">Como: </dt><dd className="inline">{p.how}</dd></div>}
                        {p.how_much_cents !== null && <div><dt className="inline font-medium text-foreground">Quanto: </dt><dd className="inline">{formatCents(p.how_much_cents)}</dd></div>}
                      </dl>
                      {p.status === 'done' && <p className="text-xs text-muted-foreground">Feita em {when(p.done_at)}{p.done_note ? `: ${p.done_note}` : ''}</p>}
                      {p.status === 'planned' && (p.can_complete || d.can_plan) && (
                        <PlanActions ncId={d.nc.id} planId={p.id} canComplete={p.can_complete} canDelete={d.can_plan} what={p.what} />
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {d.can_plan && <PlanForm ncId={d.nc.id} team={d.team} />}
            </section>

            {d.can_close && <CloseNc ncId={d.nc.id} />}
            {d.nc.status === 'resolved' && !d.can_close && <p className="text-sm text-muted-foreground">Ações concluídas. O RT verifica a eficácia e fecha.</p>}
            {d.nc.status === 'closed' && (
              <section aria-labelledby="fechamento" className="space-y-2 rounded-2xl border border-emerald-600/40 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
                <h2 id="fechamento" className="font-semibold">Fechada em {when(d.nc.closed_at)}{d.nc.closed_by_name ? ` por ${d.nc.closed_by_name}` : ''}</h2>
                {d.nc.closing_note && <p className="whitespace-pre-line">{d.nc.closing_note}</p>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.nc.has_closing_photo && <img src={ncPhotoUrl(d.nc.id, 'closing')} alt="Evidência do fechamento" className="max-h-64 rounded-lg border border-border object-contain" />}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
