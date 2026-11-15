// RN-151 — Equipamentos e temperaturas: tipos, rótulos e regras puras (as mesmas do banco, 0036).

export type EquipmentKind = 'refrigerator' | 'freezer' | 'cold_room' | 'freezer_room' | 'hot_holding' | 'cold_holding' | 'other';
export type FoodStage = 'cooking' | 'reheating' | 'holding_hot' | 'holding_cold' | 'cooling';

export const EQUIPMENT_KIND_LABEL: Record<EquipmentKind, string> = {
  refrigerator: 'Geladeira',
  freezer: 'Freezer',
  cold_room: 'Câmara de resfriados',
  freezer_room: 'Câmara de congelados',
  hot_holding: 'Estufa / balcão quente',
  cold_holding: 'Balcão refrigerado',
  other: 'Outro',
};

export const FOOD_STAGE_LABEL: Record<FoodStage, string> = {
  cooking: 'Cocção (centro do alimento)',
  reheating: 'Reaquecimento',
  holding_hot: 'Distribuição quente',
  holding_cold: 'Distribuição fria',
  cooling: 'Fim do resfriamento',
};

export interface Limits {
  min_temp: number | null;
  max_temp: number | null;
}

/** Limites padrão por tipo (RDC 216/2004; a RT revisa). */
export const EQUIPMENT_DEFAULT_LIMITS: Record<EquipmentKind, Limits> = {
  refrigerator: { min_temp: null, max_temp: 5 },
  freezer: { min_temp: null, max_temp: -18 },
  cold_room: { min_temp: null, max_temp: 5 },
  freezer_room: { min_temp: null, max_temp: -18 },
  hot_holding: { min_temp: 60, max_temp: null },
  cold_holding: { min_temp: null, max_temp: 5 },
  other: { min_temp: null, max_temp: null },
};

/** Limites por etapa do alimento: cocção e reaquecimento ≥ 70 °C, quente ≥ 60 °C, frio ≤ 5 °C, fim do resfriamento ≤ 10 °C. */
export const FOOD_STAGE_LIMITS: Record<FoodStage, Limits> = {
  cooking: { min_temp: 70, max_temp: null },
  reheating: { min_temp: 70, max_temp: null },
  holding_hot: { min_temp: 60, max_temp: null },
  holding_cold: { min_temp: null, max_temp: 5 },
  cooling: { min_temp: null, max_temp: 10 },
};

export interface Equipment extends Limits {
  id: string;
  unit_id: string;
  name: string;
  kind: EquipmentKind;
  reading_interval_hours: number;
  active: boolean;
  created_at: string;
  last: { value: number; out_of_range: boolean; recorded_at: string } | null;
  overdue: boolean;
}

export interface TemperatureReading extends Limits {
  id: string;
  equipment_id: string | null;
  food_stage: FoodStage | null;
  food_name: string | null;
  value: number;
  out_of_range: boolean;
  corrective_action: string | null;
  source: 'manual' | 'sensor';
  recorded_at: string;
  non_conformity_id: string | null;
  recorded_by_name?: string | null;
}

export interface UnitTemperatures {
  can_record: boolean;
  can_manage: boolean;
  equipment: Equipment[];
  food_readings: TemperatureReading[];
}

export interface EquipmentDetail {
  equipment: Equipment;
  unit: { id: string; name: string; active: boolean };
  can_record: boolean;
  can_manage: boolean;
  days: number;
  readings: TemperatureReading[];
}

/** Fora do limite (mesma regra do banco). */
export function outOfRange(value: number, l: Limits): boolean {
  return (l.min_temp !== null && value < l.min_temp) || (l.max_temp !== null && value > l.max_temp);
}

const t = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} °C`;
export const formatTemp = t;

/** "até 5 °C", "a partir de 60 °C", "de 0 a 4 °C". */
export function limitsLabel(l: Limits): string {
  if (l.min_temp !== null && l.max_temp !== null) return `de ${t(l.min_temp)} a ${t(l.max_temp)}`;
  if (l.max_temp !== null) return `até ${t(l.max_temp)}`;
  if (l.min_temp !== null) return `a partir de ${t(l.min_temp)}`;
  return 'sem limite';
}

/** Lê "4,5", "-18", "−18" (sinal tipográfico) como número; null se inválido. */
export function parseTemp(text: string): number | null {
  const s = text.trim().replace(',', '.').replace('−', '-');
  if (!/^-?\d{1,3}(\.\d)?$/.test(s)) return null;
  const n = Number(s);
  return n >= -60 && n <= 300 ? n : null;
}

/** Situação do equipamento para o cartão. */
export function equipmentStatus(e: Pick<Equipment, 'active' | 'last' | 'overdue'>): 'inactive' | 'never' | 'out' | 'overdue' | 'ok' {
  if (!e.active) return 'inactive';
  if (!e.last) return 'never';
  if (e.last.out_of_range) return 'out';
  if (e.overdue) return 'overdue';
  return 'ok';
}

export interface ChartPoint { x: number; y: number; value: number; at: string; out: boolean }
export interface TempChart {
  width: number;
  height: number;
  points: ChartPoint[];
  path: string;
  yTicks: Array<{ value: number; y: number }>;
  /** Linhas dos limites (mínimo e/ou máximo). */
  limits: Array<{ kind: 'min' | 'max'; value: number; y: number }>;
}

/** Geometria do gráfico de temperatura (mais antiga à esquerda), com a faixa dos limites sempre visível. */
export function temperatureChart(readings: Array<Pick<TemperatureReading, 'value' | 'recorded_at' | 'out_of_range'>>, l: Limits, width = 640, height = 220): TempChart | null {
  if (!readings.length) return null;
  const pts = [...readings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const values = [...pts.map((p) => p.value), ...(l.min_temp !== null ? [l.min_temp] : []), ...(l.max_temp !== null ? [l.max_temp] : [])];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = Math.max(1, (hi - lo) * 0.15);
  lo = Math.floor(lo - pad);
  hi = Math.ceil(hi + pad);
  const left = 40;
  const right = width - 56;
  const top = 12;
  const bottom = height - 24;
  const t0 = new Date(pts[0]!.recorded_at).getTime();
  const t1 = new Date(pts[pts.length - 1]!.recorded_at).getTime();
  const x = (at: string) => (t1 === t0 ? (left + right) / 2 : left + ((new Date(at).getTime() - t0) / (t1 - t0)) * (right - left));
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const points = pts.map((p) => ({ x: x(p.recorded_at), y: y(p.value), value: p.value, at: p.recorded_at, out: p.out_of_range }));
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  const yTicks: TempChart['yTicks'] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push({ value: v, y: y(v) });
  const limits: TempChart['limits'] = [];
  if (l.min_temp !== null) limits.push({ kind: 'min', value: l.min_temp, y: y(l.min_temp) });
  if (l.max_temp !== null) limits.push({ kind: 'max', value: l.max_temp, y: y(l.max_temp) });
  return {
    width,
    height,
    points,
    path: points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    yTicks,
    limits,
  };
}
