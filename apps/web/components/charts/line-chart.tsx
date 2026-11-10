/** Gráfico de linha simples em SVG (sem dependências), acessível por tabela oculta. */
export function LineChart({
  title,
  points,
  unit,
  decimals = 1,
}: {
  title: string;
  points: Array<{ label: string; value: number; highlight?: boolean }>;
  unit: string;
  decimals?: number;
}) {
  const W = 320;
  const H = 140;
  const P = { top: 18, right: 18, bottom: 26, left: 18 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => P.left + (i * (W - P.left - P.right)) / Math.max(points.length - 1, 1);
  const y = (v: number) => P.top + (1 - (v - min) / span) * (H - P.top - P.bottom);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.value)}`).join(' ');
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const first = points[0];
  const last = points[points.length - 1];
  const delta = first && last ? last.value - first.value : 0;

  return (
    <figure className="rounded-2xl border border-border bg-card p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {points.length > 1 && (
          <span className={delta <= 0 ? 'text-xs font-semibold text-primary' : 'text-xs font-semibold text-accent-foreground'}>
            {delta > 0 ? '+' : ''}
            {fmt(delta)} {unit}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" aria-hidden="true">
        <path d={`${path} L${x(points.length - 1)} ${H - P.bottom} L${x(0)} ${H - P.bottom} Z`} className="fill-primary/10" />
        <path d={path} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.value)} r={p.highlight ? 5 : 3.5} className={p.highlight ? 'fill-primary stroke-card' : 'fill-card stroke-primary'} strokeWidth="2" />
            <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" className="fill-foreground text-[10px] font-medium">{fmt(p.value)}</text>
            <text x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-muted-foreground text-[9px]">{p.label}</text>
          </g>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}><th scope="row">{p.label}</th><td>{fmt(p.value)} {unit}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
