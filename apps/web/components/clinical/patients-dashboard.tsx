import { AlertTriangle, CalendarCheck, CalendarClock, Smartphone, UserPlus, Users, Utensils, UserX } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { REASON_LABEL, REASON_SHORT, REASONS, type AttentionReason, type PatientsDashboard as Data } from '@/lib/clinical-dashboard/types';

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const num = (n: number) => n.toLocaleString('pt-BR');
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });

function Kpi({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="text-primary">{icon}</span>{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** Barras horizontais de contagem (uma cor, magnitude); rótulo e valor em texto. */
function Bars({ title, rows, note }: { title: string; rows: Array<[string, number]>; note?: string }) {
  const total = rows.reduce((a, [, n]) => a + n, 0);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {total === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sem dados ainda.</p> : (
        <ul className="mt-3 space-y-2">
          {rows.map(([label, n]) => (
            <li key={label} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className="truncate text-muted-foreground">{label}</span>
              <span className="h-2.5 rounded-full bg-muted" aria-hidden="true">
                <span className="block h-2.5 rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums">{num(n)} <span className="text-xs text-muted-foreground">({pct(n, total)}%)</span></span>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}

/** Painel geral dos pacientes: números do consultório, distribuição e quem precisa de atenção. */
export function PatientsDashboard({ data, reason }: { data: Data; reason: AttentionReason | null }) {
  const c = data.counts;
  const list = reason ? data.attention.filter((a) => a.reasons.includes(reason)) : data.attention;
  const screened = data.risk.low + data.risk.medium + data.risk.high;
  const w = data.weight;
  return (
    <section aria-labelledby="dash-geral" className="space-y-5">
      <h2 id="dash-geral" className="sr-only">Painel geral dos pacientes</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Pacientes ativos" icon={<Users className="size-4" />} value={num(c.active)} hint={`${num(c.inactive + c.archived)} inativos ou arquivados`} />
        <Kpi label="Novos em 30 dias" icon={<UserPlus className="size-4" />} value={num(c.new_30d)} />
        <Kpi label="Com plano publicado" icon={<Utensils className="size-4" />} value={`${pct(c.with_plan, c.active)}%`} hint={`${num(c.with_plan)} de ${num(c.active)}`} />
        <Kpi label="Consultas em 30 dias" icon={<CalendarCheck className="size-4" />} value={num(data.visits.completed_30d)} hint={`${num(data.visits.next_7d)} marcadas nos próximos 7 dias`} />
        <Kpi label="Faltas em 90 dias" icon={<UserX className="size-4" />} value={data.visits.no_show_rate_90d === null ? '—' : `${String(data.visits.no_show_rate_90d).replace('.', ',')}%`} hint="das consultas encerradas" />
        <Kpi label="Na área do paciente" icon={<Smartphone className="size-4" />} value={`${pct(c.with_app, c.active)}%`} hint={`${num(c.with_app)} com acesso`} />
      </dl>

      <div className="grid gap-5 lg:grid-cols-3">
        <section aria-labelledby="atencao" className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h3 id="atencao" className="font-semibold">Precisam de atenção</h3>
            <span className="text-sm text-muted-foreground">{num(data.attention.length)} paciente(s)</span>
          </div>
          <nav aria-label="Filtrar por motivo" className="mt-3 flex flex-wrap gap-2">
            <Link href="/app/pacientes" aria-current={reason === null ? 'page' : undefined} scroll={false}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${reason === null ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>Todos</Link>
            {REASONS.filter((r) => data.by_reason[r] > 0).map((r) => (
              <Link key={r} href={`/app/pacientes?atencao=${r}`} aria-current={reason === r ? 'page' : undefined} scroll={false} title={REASON_LABEL[r]}
                className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm ${reason === r ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {REASON_SHORT[r]} <span className="tabular-nums">{data.by_reason[r]}</span>
              </Link>
            ))}
          </nav>
          {list.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{reason ? 'Ninguém com esse motivo.' : 'Tudo em dia: nenhum paciente ativo precisa de atenção agora.'}</p>
          ) : (
            <ul aria-label="Pacientes que precisam de atenção" className="mt-4 max-h-[26rem] divide-y divide-border overflow-y-auto">
              {list.slice(0, 100).map((a) => (
                <li key={a.patient_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <Link href={`/app/pacientes/${a.patient_id}`} className="font-medium text-primary hover:underline">{a.full_name}</Link>
                  <span className="flex flex-wrap gap-1">
                    {a.reasons.map((r) => <span key={r} title={REASON_LABEL[r]} className="rounded-full bg-muted px-2 py-0.5 text-xs">{REASON_SHORT[r]}</span>)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {a.next_visit_at ? <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden="true" />{day(a.next_visit_at)}</span> : a.last_visit_at ? `Última consulta ${day(a.last_visit_at)}` : 'Sem consultas'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          <section aria-label="Evolução de peso" className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Evolução de peso</h3>
            {w.tracked === 0 ? <p className="mt-2 text-sm text-muted-foreground">Precisa de 2 pesagens por paciente.</p> : (
              <>
                <p className="mt-1 text-sm">Variação média: <strong className="tabular-nums">{w.mean_change_kg === null ? '—' : `${w.mean_change_kg > 0 ? '+' : w.mean_change_kg < 0 ? '−' : ''}${Math.abs(w.mean_change_kg).toLocaleString('pt-BR')} kg`}</strong> <span className="text-muted-foreground">({num(w.tracked)} acompanhados)</span></p>
                <ul className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                  {([['Perderam', w.losing], ['Estáveis', w.stable], ['Ganharam', w.gaining]] as const).map(([l, n]) => (
                    <li key={l} className="rounded-lg bg-muted/60 p-2"><span className="block text-xs text-muted-foreground">{l}</span><span className="font-semibold tabular-nums">{num(n)}</span></li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Da primeira à última pesagem; estável = até 0,5 kg.</p>
              </>
            )}
          </section>
          <Bars title="IMC dos adultos (última avaliação)" rows={[['Baixo peso', data.bmi.under], ['Eutrofia', data.bmi.normal], ['Sobrepeso', data.bmi.over], ['Obesidade', data.bmi.obese]]} note="Classificação da OMS, 20 anos ou mais." />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Bars title="Faixa etária" rows={[['Crianças (até 9)', data.ages.child], ['Adolescentes', data.ages.teen], ['Adultos', data.ages.adult], ['Idosos (60+)', data.ages.elderly], ['Sem nascimento', data.ages.unknown]]} />
        <Bars title="Sexo" rows={[['Feminino', data.sex.female], ['Masculino', data.sex.male], ['Não informado', data.sex.unknown]]} />
        {screened > 0 ? (
          <Bars title="Risco nutricional (última triagem)" rows={[['Baixo', data.risk.low], ['Médio', data.risk.medium], ['Alto', data.risk.high], ['Sem triagem', data.risk.none]]} />
        ) : (
          <section aria-label="Risco nutricional" className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">Risco nutricional</h3>
            <p className="mt-2">Nenhum paciente triado ainda. As triagens (MUST, NRS-2002 e ASG) ficam na aba Triagens da ficha.</p>
          </section>
        )}
      </div>
    </section>
  );
}
