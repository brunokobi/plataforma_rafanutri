import { AlertTriangle, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { StartChecklist } from '@/components/uan/start-checklist';
import { Badge } from '@/components/ui/badge';
import { FREQUENCY_LABEL, ncOverdue, SEVERITY_LABEL, type UnitChecklists } from '@/lib/uan/checklists';

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Seção "Checklists" da unidade: modelos, em andamento, concluídos e não conformidades abertas. */
export function UnitChecklistsSection({ unitId, data, useGeo }: { unitId: string; data: UnitChecklists; useGeo: boolean }) {
  const open = data.runs.filter((r) => r.status === 'in_progress');
  const done = data.runs.filter((r) => r.status === 'completed');
  const now = new Date();

  return (
    <section aria-labelledby="checklists" className="space-y-5">
      <h2 id="checklists" className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
        <ClipboardCheck className="size-6 text-primary" aria-hidden="true" /> Checklists
      </h2>

      <Link href={`/app/uan/unidades/${unitId}/nao-conformidades`} className="inline-block text-sm font-medium text-primary underline">
        Quadro de não conformidades{data.non_conformities.length ? ` (${data.non_conformities.length} em aberto)` : ''}
      </Link>
      {data.non_conformities.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Não conformidades abertas</h3>
          <ul aria-label="Não conformidades abertas" className="divide-y divide-border rounded-2xl border border-destructive/40 bg-destructive/5">
            {data.non_conformities.map((nc) => {
              const late = ncOverdue(nc, now);
              return (
                <li key={nc.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <Link href={`/app/uan/nao-conformidades/${nc.id}`} className="font-medium hover:underline">{nc.title}</Link>
                    <span className="block text-xs text-muted-foreground">
                      Prazo {when(nc.due_at)}
                      {nc.run_id && <> · <Link href={`/app/uan/checklists/${nc.run_id}`} className="underline">ver checklist</Link></>}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    {late && <Badge variant="destructive"><AlertTriangle className="size-3" /> Atrasada</Badge>}
                    <Badge variant={nc.severity === 'critical' ? 'destructive' : 'secondary'}>{SEVERITY_LABEL[nc.severity]}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {open.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Em andamento</h3>
          <ul aria-label="Checklists em andamento" className="divide-y divide-border rounded-2xl border border-border bg-card">
            {open.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <span className="font-medium">{r.template_name}</span>
                  <span className="block text-xs text-muted-foreground">{r.started_by_name ?? 'Equipe'} · {when(r.started_at)}</span>
                </span>
                <Link href={`/app/uan/checklists/${r.id}`} className="font-medium text-primary underline">Continuar</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.can_run && (
        <div className="space-y-2">
          <h3 className="font-semibold">Fazer um checklist</h3>
          <ul aria-label="Modelos de checklist" className="grid gap-3 sm:grid-cols-2">
            {data.templates.map((t) => (
              <li key={t.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {FREQUENCY_LABEL[t.frequency_hint]} · {t.item_count} itens{t.critical_count ? ` · ${t.critical_count} críticos` : ''}
                  </p>
                  {t.description && <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <StartChecklist unitId={unitId} templateId={t.id} name={t.name} useGeo={useGeo} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-semibold">Concluídos</h3>
        {done.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum checklist concluído ainda.</p>
        ) : (
          <ul aria-label="Checklists concluídos" className="divide-y divide-border rounded-2xl border border-border bg-card">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <Link href={`/app/uan/checklists/${r.id}`} className="font-medium hover:underline">{r.template_name}</Link>
                  <span className="block text-xs text-muted-foreground">{r.started_by_name ?? 'Equipe'} · {when(r.completed_at ?? r.started_at)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {(r.non_conform_count ?? 0) > 0 && <Badge variant="secondary">{r.non_conform_count} não conforme(s)</Badge>}
                  <Badge variant={r.score !== null && r.score < 75 ? 'destructive' : 'default'}>{r.score === null ? '—' : `${r.score.toLocaleString('pt-BR')}%`}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
