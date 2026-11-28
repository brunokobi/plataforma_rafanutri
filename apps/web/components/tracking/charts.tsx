import { barsGeometry, trendGeometry } from '@/lib/tracking/chart';
import { BMI_BANDS, bmiPosition, dayShort, kg, liters, type SeriesPoint } from '@/lib/tracking/types';
import { cn } from '@/lib/utils';

/** Peso ao longo do tempo: casa (linha) e consultório (pontos quadrados), com a linha tracejada do peso-alvo. */
export function WeightTrend({ series, target, className }: { series: SeriesPoint[]; target: number | null; className?: string }) {
  const g = trendGeometry(series, target);
  if (!g) return null;
  const hasClinic = g.clinic.length > 0, hasHome = g.home.length > 0;
  const lastHome = g.home.at(-1);
  return (
    <figure className={className}>
      {(hasClinic && hasHome) || target ? (
        <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {hasHome && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded bg-primary" />Em casa</span>}
          {hasClinic && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-[3px] bg-amber-500" />No consultório</span>}
          {target && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t-2 border-dashed border-foreground/40" />Meta {kg(target)}</span>}
        </figcaption>
      ) : null}
      <svg viewBox={`0 0 ${g.width} ${g.height}`} className="w-full text-primary" role="img"
        aria-label={`Peso de ${dayShort(g.first)} a ${dayShort(g.last)}: de ${kg(series[0]!.kg)} para ${kg(series.at(-1)!.kg)}${target ? `; meta ${kg(target)}` : ''}.`}>
        {g.ticks.map((t) => (
          <g key={t.value}>
            <line x1={g.x0} x2={g.x1} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
            <text x={g.x0 - 6} y={t.y + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{t.value.toLocaleString('pt-BR')}</text>
          </g>
        ))}
        {g.targetY !== null && <line x1={g.x0} x2={g.x1} y1={g.targetY} y2={g.targetY} className="stroke-foreground/40" strokeWidth={1.5} strokeDasharray="5 4" />}
        {g.home.length > 1 && <path d={g.homePath} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {g.home.map((p) => (
          <g key={`h${p.day}`}>
            <circle cx={p.x} cy={p.y} r={10} fill="transparent"><title>{`${dayShort(p.day)} (em casa): ${kg(p.kg)}`}</title></circle>
            <circle cx={p.x} cy={p.y} r={g.home.length > 8 ? 2.5 : 3.5} fill="currentColor" className="stroke-card" strokeWidth={g.home.length > 8 ? 1 : 2} pointerEvents="none" />
          </g>
        ))}
        {g.clinic.map((p) => (
          <g key={`c${p.day}`}>
            <rect x={p.x - 10} y={p.y - 10} width={20} height={20} fill="transparent"><title>{`${dayShort(p.day)} (consultório): ${kg(p.kg)}`}</title></rect>
            <rect x={p.x - 4.5} y={p.y - 4.5} width={9} height={9} rx={2} className="fill-amber-500 stroke-card" strokeWidth={2} pointerEvents="none" />
          </g>
        ))}
        {lastHome && <text x={lastHome.x + 8} y={lastHome.y + 4} className="fill-foreground text-[11px] font-semibold tabular-nums">{kg(lastHome.kg)}</text>}
        <text x={g.x0} y={g.height - 6} className="fill-muted-foreground text-[10px]">{dayShort(g.first)}</text>
        {g.first !== g.last && <text x={g.x1} y={g.height - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">{dayShort(g.last)}</text>}
      </svg>
      <details className="mt-1 text-sm">
        <summary className="min-h-11 cursor-pointer content-center text-muted-foreground">Ver os valores</summary>
        <table className="mt-1 w-full text-left text-sm">
          <thead><tr className="text-muted-foreground"><th className="py-1 font-medium">Dia</th><th className="py-1 font-medium">Peso</th><th className="py-1 font-medium">Onde</th></tr></thead>
          <tbody>
            {[...series].reverse().map((p) => (
              <tr key={`${p.source}${p.day}`} className="border-t border-border"><td className="py-1.5">{dayShort(p.day)}</td><td className="py-1.5 tabular-nums">{kg(p.kg)}</td><td className="py-1.5 text-muted-foreground">{p.source === 'clinic' ? 'Consultório' : 'Em casa'}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Água por dia (barras) com a linha da meta; dia com meta batida em cor cheia. */
export function WaterBars({ days, goal, className }: { days: Array<{ day: string; ml: number }>; goal: number; className?: string }) {
  const g = barsGeometry(days, goal);
  const hits = days.filter((d) => d.ml >= goal).length;
  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${g.width} ${g.height}`} className="w-full" role="img" aria-label={`Água nos últimos ${days.length} dias: meta batida em ${hits}.`}>
        <line x1={0} x2={g.width} y1={g.goalY} y2={g.goalY} className="stroke-sky-600/50 dark:stroke-sky-400/50" strokeWidth={1.5} strokeDasharray="5 4" />
        {g.bars.map((b, i) => (
          <g key={b.day}>
            <rect x={b.x - 2} y={0} width={b.w + 4} height={g.height - 20} fill="transparent"><title>{`${dayShort(b.day)}: ${liters(b.ml)}`}</title></rect>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(4, b.w / 2)} className={b.hit ? 'fill-sky-500' : 'fill-sky-500/35'} pointerEvents="none" />
            {(i === 0 || i === g.bars.length - 1 || (g.bars.length <= 7)) && (
              <text x={g.bars.length <= 7 ? b.x + b.w / 2 : i === 0 ? b.x : b.x + b.w} y={g.height - 6} textAnchor={g.bars.length <= 7 ? 'middle' : i === 0 ? 'start' : 'end'} className="fill-muted-foreground text-[10px]">
                {g.bars.length <= 7 ? new Date(`${b.day}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '') : dayShort(b.day)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-sky-600/50" /> Meta {liters(goal)} · batida em {hits} de {days.length} dias
      </figcaption>
    </figure>
  );
}

/** Régua do IMC (adulto) com o marcador do valor atual. */
export function BmiGauge({ bmi, label }: { bmi: number; label: string }) {
  const colors = ['bg-sky-400', 'bg-emerald-500', 'bg-amber-400', 'bg-rose-500'];
  return (
    <div>
      <div className="relative mt-3 flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
        {BMI_BANDS.map((b, i) => (
          <span key={b.label} className={cn('h-full', colors[i])} style={{ width: `${((b.to - b.from) / 25) * 100}%` }} />
        ))}
      </div>
      <div className="relative h-4" aria-hidden="true">
        <span className="absolute -top-[13px] size-4 -translate-x-1/2 rounded-full border-[3px] border-card bg-foreground shadow" style={{ left: `${bmiPosition(bmi) * 100}%` }} />
      </div>
      <div className="relative h-3 text-[10px] text-muted-foreground" aria-hidden="true">
        {[18.5, 25, 30].map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: `${bmiPosition(v) * 100}%` }}>{v.toLocaleString('pt-BR')}</span>
        ))}
      </div>
      <p className="sr-only">IMC {bmi.toLocaleString('pt-BR')}: {label}</p>
    </div>
  );
}
