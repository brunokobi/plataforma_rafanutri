'use client';

import { useMemo, useState } from 'react';
import type { SeriesPoint } from '@/lib/clinical-dashboard/types';

type MetricKey = 'weight_kg' | 'bmi' | 'body_fat_pct' | 'waist_cm';
const METRICS: Array<{ key: MetricKey; label: string; unit: string }> = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg' },
  { key: 'bmi', label: 'IMC', unit: 'kg/m²' },
  { key: 'body_fat_pct', label: 'Gordura', unit: '%' },
  { key: 'waist_cm', label: 'Cintura', unit: 'cm' },
];

const W = 640;
const H = 220;
const PAD = { l: 44, r: 64, t: 14, b: 28 };
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const short = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

function ticks(min: number, max: number): number[] {
  const span = max - min || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 4) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Evolução de uma medida do paciente (uma série por vez, sem legenda): linha de 2 px, ponto em destaque no hover e tabela. */
export function MetricChart({ series }: { series: SeriesPoint[] }) {
  const available = METRICS.filter((m) => series.filter((s) => s[m.key] !== null).length > 0);
  const [metric, setMetric] = useState<MetricKey>(available[0]?.key ?? 'weight_kg');
  const [hover, setHover] = useState<number | null>(null);
  const m = METRICS.find((x) => x.key === metric)!;
  const pts = useMemo(() => series.filter((s) => s[metric] !== null).map((s) => ({ date: s.date, v: s[metric] as number })), [series, metric]);

  if (available.length === 0) return <p className="text-sm text-muted-foreground">Ainda não há medidas para o gráfico. Registre uma avaliação.</p>;

  const vs = pts.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.02, 0.5);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const t0 = Date.parse(pts[0]!.date);
  const t1 = Date.parse(pts.at(-1)!.date);
  const x = (d: string) => (pts.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts.at(-1)!;
  const first = pts[0]!;
  const diff = Math.round((last.v - first.v) * 10) / 10;
  const h = hover !== null ? pts[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(pts[best]!.date) - px)) best = i; });
    setHover(best);
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Medida do gráfico" className="flex flex-wrap gap-2">
        {available.map((a) => (
          <button key={a.key} type="button" role="radio" aria-checked={metric === a.key} onClick={() => { setMetric(a.key); setHover(null); }}
            className={`min-h-9 rounded-full border px-3 text-sm ${metric === a.key ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {a.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {pts.length === 1 ? `${fmt(last.v)} ${m.unit} em ${short(last.date)}` : `${fmt(last.v)} ${m.unit} na última avaliação · ${diff === 0 ? 'estável' : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} ${m.unit}`} desde ${short(first.date)}`}
      </p>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none text-primary" role="img"
          aria-label={`${m.label}: de ${fmt(first.v)} ${m.unit} em ${short(first.date)} para ${fmt(last.v)} ${m.unit} em ${short(last.date)}.`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks(yMin, yMax).map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmt(t)}</text>
            </g>
          ))}
          {h && <line x1={x(h.date)} x2={x(h.date)} y1={PAD.t} y2={H - PAD.b} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />}
          {pts.length > 1 && <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {pts.map((p, i) => (
            <circle key={p.date + i} cx={x(p.date)} cy={y(p.v)} r={hover === i ? 5 : 4} fill="currentColor" className="stroke-card" strokeWidth={2} />
          ))}
          <text x={x(last.date) + 8} y={y(last.v) + 4} className="fill-foreground text-[11px] font-medium">{fmt(last.v)}</text>
          <text x={x(first.date)} y={H - 8} textAnchor={pts.length > 1 ? 'start' : 'middle'} className="fill-muted-foreground text-[10px]">{short(first.date)}</text>
          {pts.length > 1 && <text x={x(last.date)} y={H - 8} textAnchor="end" className="fill-muted-foreground text-[10px]">{short(last.date)}</text>}
        </svg>
        {h && (
          <div role="status" className="pointer-events-none absolute top-0 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-sm"
            style={{ left: `${Math.min(80, Math.max(0, (x(h.date) / W) * 100 - 8))}%` }}>
            <span className="text-muted-foreground">{short(h.date)}</span> · <span className="font-medium tabular-nums">{fmt(h.v)} {m.unit}</span>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="min-h-9 cursor-pointer content-center text-muted-foreground">Ver os valores</summary>
        <table className="w-full text-left tabular-nums">
          <thead><tr><th className="py-1 font-medium">Data</th>{available.map((a) => <th key={a.key} className="py-1 text-right font-medium">{a.label}</th>)}</tr></thead>
          <tbody>
            {[...series].reverse().map((s, i) => (
              <tr key={s.date + i} className="border-t border-border">
                <td className="py-1">{short(s.date)}</td>
                {available.map((a) => <td key={a.key} className="py-1 text-right">{s[a.key] !== null ? fmt(s[a.key] as number) : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
