import Link from 'next/link';
import { formatCents } from '@/lib/finance/money';
import { monthLong } from '@/lib/finance/types';
import { delta, type Indicators } from '@/lib/indicators/types';
import { cn } from '@/lib/utils';

function Card({ label, value, hint, change, href, warn }: { label: string; value: string; hint?: string | null; change?: string | null; href?: string; warn?: boolean }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className={cn('mt-0.5 text-xs', warn ? 'font-medium text-destructive' : 'text-muted-foreground')}>
        {hint}{hint && change ? ' · ' : ''}{change ? `${change} vs. mês anterior` : ''}
      </p>
    </>
  );
  return href ? (
    <Link href={href} role="group" aria-label={label} className="block rounded-2xl border border-border bg-card p-4 hover:border-primary/50">{body}</Link>
  ) : (
    <div role="group" aria-label={label} className="rounded-2xl border border-border bg-card p-4">{body}</div>
  );
}

/** RN-064 — Indicadores do consultório no painel inicial (mês corrente × anterior; filtro por nutricionista na clínica). */
export function IndicatorsPanel({ data }: { data: Indicators }) {
  const c = data.current;
  const p = data.previous;
  const ym = c.month.slice(0, 7);
  return (
    <section aria-labelledby="indicadores" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="indicadores" className="font-display text-xl font-semibold">Indicadores de <span className="capitalize">{monthLong(ym)}</span></h2>
        {data.nutritionists.length > 0 && (
          <nav aria-label="Filtrar por nutricionista" className="ml-auto flex flex-wrap gap-1">
            <Link href="/app/clinico" aria-current={data.nutritionist ? undefined : 'page'} className={cn('rounded-md px-3 py-1.5 text-sm', !data.nutritionist ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>Todos</Link>
            {data.nutritionists.map((n) => (
              <Link key={n.id} href={`/app/clinico?nutricionista=${n.id}`} aria-current={data.nutritionist === n.id ? 'page' : undefined}
                className={cn('rounded-md px-3 py-1.5 text-sm', data.nutritionist === n.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{n.name}</Link>
            ))}
          </nav>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Faturamento do mês" value={formatCents(c.revenue_cents)} change={delta(c.revenue_cents, p.revenue_cents)} href="/app/financeiro" hint={data.nutritionist ? 'do consultório' : null} />
        <Card label="A receber" value={formatCents(data.receivable_cents)} hint={data.overdue_cents > 0 ? `${formatCents(data.overdue_cents)} atrasado` : 'nada atrasado'} warn={data.overdue_cents > 0} href="/app/financeiro" />
        <Card label="Ticket médio" value={formatCents(c.avg_ticket_cents)} hint={c.paid_count ? `${c.paid_count} pagamento${c.paid_count > 1 ? 's' : ''} de pacientes` : 'sem pagamentos de pacientes'} change={delta(c.avg_ticket_cents, p.avg_ticket_cents)} />
        <Card label="Consultas realizadas" value={String(c.visits)} change={delta(c.visits, p.visits)} href="/app/agenda" />
        <Card label="Taxa de faltas" value={`${c.no_show_rate.toLocaleString('pt-BR')}%`} hint={`${c.no_shows} falta${c.no_shows === 1 ? '' : 's'}`} />
        <Card label="Novos pacientes" value={String(c.new_patients)} change={delta(c.new_patients, p.new_patients)} href="/app/pacientes" />
        <Card label="Retornos atrasados" value={String(data.overdue_returns)} hint="sem consulta marcada" warn={data.overdue_returns > 0} href="/app/crm?aba=retornos&janela=overdue" />
      </div>
    </section>
  );
}
