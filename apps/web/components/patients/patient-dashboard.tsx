import { Activity, CalendarCheck, ClipboardList, FileText, Package, Smartphone, Stethoscope, Utensils } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MetricChart } from '@/components/charts/metric-chart';
import type { PatientDashboard as Data, TimelineEvent } from '@/lib/clinical-dashboard/types';

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const dayTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const kg = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
const signedKg = (n: number) => (n === 0 ? 'estável' : `${n > 0 ? '+' : '−'}${kg(Math.abs(n))}`);
const RISK = { low: 'Risco baixo', medium: 'Risco médio', high: 'Risco alto' } as const;
const KIND_LABEL: Record<TimelineEvent['kind'], string> = {
  assessment: 'Avaliação', visit: 'Consulta', no_show: 'Falta', plan: 'Plano', note: 'Prontuário', anamnesis: 'Anamnese', screening: 'Triagem', document: 'Documento',
};

function Kpi({ label, value, hint, href, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; icon: ReactNode; tone?: 'warn' }) {
  const body = (
    <>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="text-primary">{icon}</span>{label}</dt>
      <dd className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</dd>
      {hint && <dd className={`text-xs ${tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>{hint}</dd>}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50"><dl>{body}</dl></Link>
  ) : (
    <div className="rounded-xl border border-border bg-card p-3"><dl>{body}</dl></div>
  );
}

/** Painel do paciente (aba Resumo): números do acompanhamento, evolução das medidas e linha do tempo. */
export function PatientDashboard({ patientId, data }: { patientId: string; data: Data }) {
  const base = `/app/pacientes/${patientId}`;
  const v = data.visits;
  const plan = data.plan.published;
  const planDays = plan?.days_left ?? null;
  return (
    <section aria-labelledby="patient-dash" className="space-y-5">
      <h2 id="patient-dash" className="sr-only">Painel do paciente</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Consultas" icon={<CalendarCheck className="size-4" />} href="/app/agenda"
          value={v.completed}
          hint={v.next_at ? `Próxima: ${dayTime(v.next_at)}` : v.days_since_last !== null ? `Última há ${v.days_since_last} dias · sem retorno` : 'Nenhuma realizada'}
          tone={!v.next_at && (v.days_since_last ?? 0) > 45 ? 'warn' : undefined} />
        <Kpi label="Peso" icon={<Activity className="size-4" />} href={`${base}/avaliacoes`}
          value={data.weight ? kg(data.weight.last.weight_kg!) : '—'}
          hint={data.weight ? (data.weight.change_kg !== null ? `${signedKg(data.weight.change_kg)} desde ${day(data.weight.first.date)}` : `Em ${day(data.weight.last.date)}`) : 'Sem pesagem'} />
        <Kpi label="Plano alimentar" icon={<Utensils className="size-4" />} href={`${base}/planos`}
          value={plan ? (plan.kcal ? `${Math.round(plan.kcal).toLocaleString('pt-BR')} kcal` : 'Publicado') : 'Sem plano'}
          hint={plan ? (planDays === null ? `${data.plan.versions} versão(ões)` : planDays < 0 ? 'Vencido' : `Vence em ${planDays} dias`) : data.plan.drafts ? `${data.plan.drafts} rascunho(s)` : undefined}
          tone={plan && planDays !== null && planDays <= 14 ? 'warn' : undefined} />
        <Kpi label="Prontuário" icon={<Stethoscope className="size-4" />} href={`${base}/prontuario`}
          value={data.notes.count} hint={data.notes.last_at ? `Última evolução em ${day(data.notes.last_at)}` : 'Nenhuma evolução'} />
        <Kpi label="Anamneses" icon={<ClipboardList className="size-4" />} href={`${base}/anamneses`}
          value={data.anamneses.total}
          hint={data.anamneses.answered_pending ? `${data.anamneses.answered_pending} para revisar` : data.anamneses.sent ? `${data.anamneses.sent} aguardando resposta` : undefined}
          tone={data.anamneses.answered_pending ? 'warn' : undefined} />
        <Kpi label="Área do paciente" icon={<Smartphone className="size-4" />}
          value={data.app.linked ? 'Ativa' : 'Sem acesso'}
          hint={data.recommendations.published ? `${data.recommendations.unread} de ${data.recommendations.published} recomendações não lidas` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section aria-labelledby="evolucao" className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <h3 id="evolucao" className="font-semibold">Evolução</h3>
          <div className="mt-3"><MetricChart series={data.series} /></div>
        </section>
        <section aria-labelledby="historico" className="rounded-2xl border border-border bg-card p-5">
          <h3 id="historico" className="font-semibold">Histórico recente</h3>
          {data.timeline.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nada registrado ainda.</p>
          ) : (
            <ol aria-label="Histórico do paciente" className="mt-3 space-y-2.5">
              {data.timeline.slice(0, 12).map((e, i) => (
                <li key={`${e.kind}-${e.at}-${i}`} className="grid grid-cols-[4.5rem_1fr] gap-2 text-sm">
                  <span className="text-xs tabular-nums text-muted-foreground">{day(e.at).replace(/ de /g, ' ')}</span>
                  <span className="min-w-0"><span className="text-xs font-medium text-muted-foreground">{KIND_LABEL[e.kind]} · </span><span className="break-words">{e.label}</span></span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {(data.package || data.screening || data.documents > 0 || v.no_show > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {data.package && <Chip icon={<Package className="size-3.5" />}>{data.package.name}: {data.package.remaining} de {data.package.total} sessões{data.package.expires_at ? ` · vence ${day(data.package.expires_at)}` : ''}</Chip>}
          {data.screening && <Chip icon={<Activity className="size-3.5" />} href={`${base}/triagens`}>Última triagem: {RISK[data.screening.risk_level]} ({day(data.screening.screened_at)})</Chip>}
          {data.documents > 0 && <Chip icon={<FileText className="size-3.5" />} href={`${base}/documentos`}>{data.documents} documento(s) publicado(s)</Chip>}
          {v.no_show > 0 && <Chip icon={<CalendarCheck className="size-3.5" />}>{v.no_show} falta(s)</Chip>}
        </div>
      )}
    </section>
  );
}

function Chip({ icon, children, href }: { icon: ReactNode; children: ReactNode; href?: string }) {
  const cls = 'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3';
  return href ? <Link href={href} className={`${cls} hover:border-primary/50`}><span aria-hidden="true" className="text-primary">{icon}</span>{children}</Link>
    : <span className={cls}><span aria-hidden="true" className="text-primary">{icon}</span>{children}</span>;
}
