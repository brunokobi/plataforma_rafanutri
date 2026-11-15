import { AlertTriangle, Check, MapPin, Minus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ANSWER_LABEL, outsideRadius, photoUrl, rangeLabel, SEVERITY_LABEL, signatureUrl, type RunDetail } from '@/lib/uan/checklists';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';
const ICON = { conform: Check, non_conform: X, na: Minus } as const;

/** Checklist concluído (ou só para consulta): resumo, não conformidades abertas e todas as respostas. */
export function ChecklistResult({ detail }: { detail: RunDetail }) {
  const { run } = detail;
  const done = run.status === 'completed';
  const ncByPosition = new Map(detail.non_conformities.map((n) => [n.answer_position, n]));
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        {done ? (
          <>
            <p className="text-sm text-muted-foreground">Concluído em {when(run.completed_at)}{run.completed_by_name ? ` por ${run.completed_by_name}` : ''}</p>
            <p className="mt-2 font-display text-4xl font-semibold" aria-label="Conformidade">{run.score === null ? '—' : `${run.score.toLocaleString('pt-BR')}%`}</p>
            <p className="text-sm text-muted-foreground">
              {run.conform_count} conforme(s) · {run.non_conform_count} não conforme(s) · {run.na_count} não se aplica
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{run.status === 'cancelled' ? 'Checklist cancelado.' : 'Checklist em andamento. Seu papel nesta unidade permite só consultar.'}</p>
        )}
        {outsideRadius(run.geo_distance_m, detail.unit.geo_radius_m) && (
          <p className="mt-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400"><MapPin className="size-4" aria-hidden="true" /> Iniciado a {run.geo_distance_m} m da unidade.</p>
        )}
        {run.has_signature && (
          <figure className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signatureUrl(run.id)} alt="Assinatura de quem fez o checklist" className="h-20 rounded-lg border border-border bg-white object-contain" />
          </figure>
        )}
        {detail.non_conformities.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm"><AlertTriangle className="size-4 text-destructive" aria-hidden="true" /> {detail.non_conformities.length} não conformidade(s) aberta(s) por itens críticos.</p>
        )}
      </div>

      <ol aria-label="Respostas" className="divide-y divide-border rounded-2xl border border-border bg-card">
        {detail.answers.map((a) => {
          const Icon = a.value ? ICON[a.value] : Minus;
          const nc = ncByPosition.get(a.position);
          return (
            <li key={a.position} className="space-y-2 p-4 text-sm">
              <div className="flex items-start gap-3">
                <span
                  className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                    a.value === 'conform' ? 'bg-emerald-600 text-white' : a.value === 'non_conform' ? 'bg-destructive text-white' : 'bg-muted text-muted-foreground')}
                  aria-label={a.value ? ANSWER_LABEL[a.value] : 'Sem resposta'} role="img"
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p><span className="text-muted-foreground">{a.position}.</span> {a.prompt}</p>
                  {a.kind === 'number' && a.value !== 'na' && a.number_value !== null && (
                    <p className="text-muted-foreground">Medido: <span className="font-medium text-foreground">{a.number_value.toLocaleString('pt-BR')}{a.unit ? ` ${a.unit}` : ''}</span> (esperado {rangeLabel(a)})</p>
                  )}
                  {a.comment && <p className="rounded-lg bg-muted/60 p-2">{a.comment}</p>}
                  <div className="flex flex-wrap gap-1">
                    {a.critical && <Badge variant="outline">Crítico</Badge>}
                    {nc && <Badge variant="destructive">Não conformidade {SEVERITY_LABEL[nc.severity].toLowerCase()}</Badge>}
                  </div>
                </div>
              </div>
              {a.has_photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl(run.id, a.position)} alt={`Evidência do item ${a.position}`} loading="lazy" className="ml-9 max-h-48 rounded-lg border border-border object-contain" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
