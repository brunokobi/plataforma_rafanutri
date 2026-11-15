import { formatTemp, limitsLabel, temperatureChart, type Limits, type TemperatureReading } from '@/lib/uan/temperatures';

const short = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/**
 * Temperatura ao longo do tempo (uma série, sem legenda). As linhas tracejadas são os limites; pontos fora
 * do limite são vazados e maiores (não dependem só da cor). A tabela da página traz os valores.
 */
export function TemperatureChart({ readings, limits, name }: { readings: TemperatureReading[]; limits: Limits; name: string }) {
  const g = temperatureChart(readings, limits);
  if (!g) return null;
  const last = g.points[g.points.length - 1]!;
  const outs = g.points.filter((p) => p.out).length;
  return (
    <figure className="rounded-2xl border border-border bg-card p-4">
      <figcaption className="text-sm text-muted-foreground">
        {g.points.length} leitura(s) · limite {limitsLabel(limits)}{outs ? ` · ${outs} fora do limite` : ''}
      </figcaption>
      <svg
        viewBox={`0 0 ${g.width} ${g.height}`} className="mt-2 w-full text-primary" role="img"
        aria-label={`Temperatura de ${name}: ${g.points.length} leituras, a última ${formatTemp(last.value)} em ${short(last.at)}${outs ? `, ${outs} fora do limite` : ''}.`}
      >
        {g.yTicks.map((t) => (
          <g key={t.value}>
            <line x1={40} x2={g.width - 56} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
            <text x={34} y={t.y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{t.value.toLocaleString('pt-BR')}</text>
          </g>
        ))}
        {g.limits.map((l) => (
          <g key={l.kind}>
            <line x1={40} x2={g.width - 56} y1={l.y} y2={l.y} className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={g.width - 52} y={l.y + 4} className="fill-muted-foreground text-[11px]">{l.kind === 'max' ? 'máx.' : 'mín.'} {l.value.toLocaleString('pt-BR')}</text>
          </g>
        ))}
        {g.points.length > 1 && <path d={g.path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {g.points.map((p, i) => (
          <g key={`${p.at}-${i}`}>
            <circle cx={p.x} cy={p.y} r={12} fill="transparent"><title>{`${short(p.at)}: ${formatTemp(p.value)}${p.out ? ' (fora do limite)' : ''}`}</title></circle>
            {p.out ? (
              <circle cx={p.x} cy={p.y} r={5} className="fill-card stroke-destructive" strokeWidth={2.5} pointerEvents="none" />
            ) : (
              <circle cx={p.x} cy={p.y} r={4} fill="currentColor" className="stroke-card" strokeWidth={2} pointerEvents="none" />
            )}
          </g>
        ))}
        <text x={g.points[0]!.x} y={g.height - 6} textAnchor="start" className="fill-muted-foreground text-[11px]">{short(g.points[0]!.at)}</text>
        {g.points.length > 1 && <text x={last.x} y={g.height - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">{short(last.at)}</text>}
      </svg>
    </figure>
  );
}
