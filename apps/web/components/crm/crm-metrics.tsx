import Link from 'next/link';
import { metricsTotals, SOURCE_LABEL, type Metrics } from '@/lib/crm/types';
import { cn } from '@/lib/utils';

/** RN-056 — Indicadores: leads por origem e conversão em 1ª consulta. */
export function CrmMetrics({ data }: { data: Metrics }) {
  const t = metricsTotals(data.by_source);
  const max = Math.max(1, ...data.by_source.map((r) => r.leads));
  return (
    <div className="space-y-5">
      <nav aria-label="Período" className="flex flex-wrap gap-1">
        {[30, 90, 180, 365].map((d) => (
          <Link key={d} href={`/app/crm?aba=indicadores&dias=${d}`} aria-current={data.days === d ? 'page' : undefined}
            className={cn('rounded-md px-3 py-1.5 text-sm', data.days === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{d} dias</Link>
        ))}
      </nav>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Leads</p><p className="font-display text-2xl font-semibold">{t.leads}</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Viraram paciente com 1ª consulta</p><p className="font-display text-2xl font-semibold">{t.first_visit}</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Conversão lead → 1ª consulta</p><p className="font-display text-2xl font-semibold">{t.rate.toLocaleString('pt-BR')}%</p></div>
      </div>
      {data.by_source.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum lead no período.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Leads por origem</caption>
          <thead className="text-muted-foreground"><tr><th className="py-2 font-medium">Origem</th><th className="py-2 font-medium">Leads</th><th className="py-2 text-right font-medium">Pacientes</th><th className="py-2 text-right font-medium">1ª consulta</th><th className="py-2 text-right font-medium">Perdidos</th></tr></thead>
          <tbody>
            {data.by_source.map((r) => (
              <tr key={r.source} className="border-t border-border">
                <td className="py-2">{SOURCE_LABEL[r.source]}</td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-2"><span className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, (r.leads / max) * 64)}px` }} aria-hidden="true" /> {r.leads}</span>
                </td>
                <td className="py-2 text-right tabular-nums">{r.converted}</td>
                <td className="py-2 text-right tabular-nums">{r.first_visit}</td>
                <td className="py-2 text-right tabular-nums">{r.lost}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
