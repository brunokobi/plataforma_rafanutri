import { dateBR } from '@/lib/format/date';
import type { WeightPoint } from '@/lib/patient-area/types';
import { weightChartGeometry } from '@/lib/patient-area/weight-chart';

const kg = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
const short = (d: string) => dateBR(d, { day: '2-digit', month: 'short' });

/** RN-210 — Peso ao longo do tempo (uma série: sem legenda; último valor rotulado; tabela para leitores de tela). */
export function WeightChart({ data }: { data: WeightPoint[] }) {
  const g = weightChartGeometry(data);
  if (!g) return null;
  const last = g.points[g.points.length - 1]!;
  const first = g.points[0]!;
  const diff = Math.round((last.weight - first.weight) * 10) / 10;
  return (
    <section aria-labelledby="peso" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="peso" className="font-semibold">Seu peso</h2>
      <p className="text-sm text-muted-foreground">
        {g.points.length === 1 ? `${kg(last.weight)} em ${short(last.date)}` : `${kg(last.weight)} hoje · ${diff === 0 ? 'estável' : `${diff > 0 ? '+' : '−'}${kg(Math.abs(diff))}`} desde ${short(first.date)}`}
      </p>
      <svg viewBox={`0 0 ${g.width} ${g.height}`} className="mt-3 w-full text-primary" role="img" aria-label={`Gráfico do peso: de ${kg(first.weight)} em ${short(first.date)} para ${kg(last.weight)} em ${short(last.date)}.`}>
        {g.yTicks.map((t) => (
          <g key={t.value}>
            <line x1={36} x2={g.width - 44} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
            <text x={30} y={t.y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{t.value.toLocaleString('pt-BR')}</text>
          </g>
        ))}
        {g.points.length > 1 && <path d={g.path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {g.points.map((p) => (
          <g key={p.date}>
            <circle cx={p.x} cy={p.y} r={12} fill="transparent"><title>{`${short(p.date)}: ${kg(p.weight)}`}</title></circle>
            <circle cx={p.x} cy={p.y} r={4} fill="currentColor" className="stroke-card" strokeWidth={2} pointerEvents="none" />
          </g>
        ))}
        <text x={last.x + 8} y={last.y + 4} className="fill-foreground text-[11px] font-medium">{kg(last.weight)}</text>
        <text x={first.x} y={g.height - 6} textAnchor={g.points.length > 1 ? 'start' : 'middle'} className="fill-muted-foreground text-[10px]">{short(first.date)}</text>
        {g.points.length > 1 && <text x={last.x} y={g.height - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">{short(last.date)}</text>}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer content-center text-muted-foreground">Ver os valores</summary>
        <table className="w-full text-left tabular-nums">
          <thead><tr><th className="py-1 font-medium">Data</th><th className="py-1 text-right font-medium">Peso</th></tr></thead>
          <tbody>{[...g.points].reverse().map((p) => <tr key={p.date} className="border-t border-border"><td className="py-1">{dateBR(p.date)}</td><td className="py-1 text-right">{kg(p.weight)}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}
