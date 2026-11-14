import type { WeightPoint } from './types';

export interface ChartGeometry {
  width: number;
  height: number;
  points: Array<{ x: number; y: number; date: string; weight: number }>;
  path: string;
  yTicks: Array<{ y: number; value: number }>;
}

/** Geometria do gráfico de peso (função pura): escala com folga de 1 kg e 3 marcas no eixo. */
export function weightChartGeometry(data: WeightPoint[], width = 320, height = 160, pad = { top: 16, right: 44, bottom: 24, left: 36 }): ChartGeometry | null {
  if (data.length === 0) return null;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const ws = sorted.map((d) => d.weight_kg);
  let min = Math.floor(Math.min(...ws) - 1);
  let max = Math.ceil(Math.max(...ws) + 1);
  if (max - min < 2) { min -= 1; max += 1; }
  const t = (d: string) => new Date(`${d}T12:00:00Z`).getTime();
  const t0 = t(sorted[0]!.date);
  const t1 = t(sorted[sorted.length - 1]!.date);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (d: string) => (t1 === t0 ? pad.left + innerW / 2 : pad.left + ((t(d) - t0) / (t1 - t0)) * innerW);
  const y = (w: number) => pad.top + (1 - (w - min) / (max - min)) * innerH;
  const points = sorted.map((d) => ({ x: x(d.date), y: y(d.weight_kg), date: d.date, weight: d.weight_kg }));
  const mid = Math.round(((min + max) / 2) * 10) / 10;
  return {
    width,
    height,
    points,
    path: points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    yTicks: [max, mid, min].map((v) => ({ y: y(v), value: v })),
  };
}
