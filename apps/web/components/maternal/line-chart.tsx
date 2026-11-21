/** Gráfico de linhas em SVG (sem biblioteca): faixas/curvas de referência e os pontos do paciente. */
export interface ChartLine {
  points: Array<[number, number]>;
  label: string;
  /** strong = mediana; soft = linhas de alerta (±2); faint = ±3. */
  tone: 'strong' | 'soft' | 'faint';
}

interface Props {
  title: string;
  xLabel: string;
  yLabel: string;
  xMin?: number;
  xMax: number;
  lines?: ChartLine[];
  band?: Array<{ x: number; min: number; max: number }>;
  points: Array<[number, number]>;
  pointLabel: (p: [number, number]) => string;
}

const W = 640;
const H = 320;
const PAD = { l: 48, r: 56, t: 16, b: 40 };

function niceTicks(min: number, max: number, count = 6): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function LineChart({ title, xLabel, yLabel, xMin = 0, xMax, lines = [], band, points, pointLabel }: Props) {
  const ys = [...lines.flatMap((l) => l.points.map((p) => p[1])), ...(band ?? []).flatMap((b) => [b.min, b.max]), ...points.map((p) => p[1])];
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.06 || 1;
  const yMin = Math.min(...ys) - pad;
  const yMax = Math.max(...ys) + pad;
  const sx = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
  const path = (pts: Array<[number, number]>) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('');
  const bandPath = band && band.length > 1
    ? `${band.map((b, i) => `${i ? 'L' : 'M'}${sx(b.x).toFixed(1)},${sy(b.max).toFixed(1)}`).join('')}${[...band].reverse().map((b) => `L${sx(b.x).toFixed(1)},${sy(b.min).toFixed(1)}`).join('')}Z`
    : null;
  const toneClass = { strong: 'stroke-primary', soft: 'stroke-amber-500', faint: 'stroke-destructive/60' } as const;

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full max-w-3xl text-muted-foreground">
        {niceTicks(yMin, yMax).map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.l - 6} y={sy(t) + 4} textAnchor="end" className="fill-current text-[11px]">{fmt(t)}</text>
          </g>
        ))}
        {niceTicks(xMin, xMax, 8).map((t) => (
          <text key={`x${t}`} x={sx(t)} y={H - PAD.b + 16} textAnchor="middle" className="fill-current text-[11px]">{fmt(t)}</text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" className="fill-current text-[11px]">{xLabel}</text>
        <text x={12} y={PAD.t + 4} className="fill-current text-[11px]">{yLabel}</text>
        {bandPath && <path d={bandPath} className="fill-primary/15" />}
        {lines.map((l) => (
          <g key={l.label}>
            <path d={path(l.points)} fill="none" strokeWidth={l.tone === 'strong' ? 2 : 1.5} strokeDasharray={l.tone === 'faint' ? '4 4' : undefined} className={toneClass[l.tone]} />
            {l.points.length > 0 && (
              <text x={sx(l.points.at(-1)![0]) + 4} y={sy(l.points.at(-1)![1]) + 4} className="fill-current text-[10px]">{l.label}</text>
            )}
          </g>
        ))}
        {points.length > 1 && <path d={path(points)} fill="none" strokeWidth={2} className="stroke-foreground" />}
        {points.map((p) => (
          <circle key={`${p[0]}-${p[1]}`} cx={sx(p[0])} cy={sy(p[1])} r={5} className="fill-foreground stroke-background" strokeWidth={2}>
            <title>{pointLabel(p)}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="text-xs text-muted-foreground">{title}</figcaption>
    </figure>
  );
}
