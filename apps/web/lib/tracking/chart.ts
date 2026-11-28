// Geometria dos gráficos do acompanhamento (SVG puro): eixo de datas por dia e eixo de valores com folga.
import type { SeriesPoint } from './types';

export interface TrendGeometry {
  width: number; height: number;
  x0: number; x1: number; y0: number; y1: number;
  ticks: Array<{ value: number; y: number }>;
  home: Array<SeriesPoint & { x: number; y: number }>;
  clinic: Array<SeriesPoint & { x: number; y: number }>;
  homePath: string;
  targetY: number | null;
  first: string; last: string;
}

const dayNum = (d: string) => Date.parse(`${d}T12:00:00Z`) / 864e5;

/** Linha do peso: casa (linha + pontos) e consultório (pontos), com a linha do peso-alvo. */
export function trendGeometry(series: SeriesPoint[], target: number | null, width = 340, height = 180): TrendGeometry | null {
  if (!series.length) return null;
  const x0 = 34, x1 = width - 46, y0 = 12, y1 = height - 24;
  const values = series.map((p) => p.kg).concat(target ? [target] : []);
  let lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max(1, (hi - lo) * 0.15);
  lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
  const d0 = dayNum(series[0]!.day), d1 = dayNum(series.at(-1)!.day);
  const xOf = (d: string) => (d1 === d0 ? (x0 + x1) / 2 : x0 + ((dayNum(d) - d0) / (d1 - d0)) * (x1 - x0));
  const yOf = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
  const step = (hi - lo) / 3;
  const ticks = [0, 1, 2, 3].map((i) => { const v = Math.round((lo + step * i) * 10) / 10; return { value: v, y: yOf(v) }; });
  const place = (p: SeriesPoint) => ({ ...p, x: xOf(p.day), y: yOf(p.kg) });
  const home = series.filter((p) => p.source === 'patient').map(place);
  const clinic = series.filter((p) => p.source === 'clinic').map(place);
  const homePath = home.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { width, height, x0, x1, y0, y1, ticks, home, clinic, homePath, targetY: target ? yOf(target) : null, first: series[0]!.day, last: series.at(-1)!.day };
}

export interface BarsGeometry {
  width: number; height: number; goalY: number;
  bars: Array<{ day: string; ml: number; x: number; y: number; w: number; h: number; hit: boolean }>;
}

/** Barras de água por dia com a linha da meta. */
export function barsGeometry(days: Array<{ day: string; ml: number }>, goal: number, width = 340, height = 140): BarsGeometry {
  const top = 10, bottom = height - 22;
  const max = Math.max(goal * 1.2, ...days.map((d) => d.ml), 1);
  const slot = (width - 8) / Math.max(1, days.length);
  const w = Math.max(4, Math.min(28, slot - 4));
  const yOf = (ml: number) => bottom - (ml / max) * (bottom - top);
  return {
    width, height, goalY: yOf(goal),
    bars: days.map((d, i) => {
      const y = yOf(d.ml);
      return { day: d.day, ml: d.ml, x: 4 + i * slot + (slot - w) / 2, y, w, h: Math.max(0, bottom - y), hit: d.ml >= goal };
    }),
  };
}
