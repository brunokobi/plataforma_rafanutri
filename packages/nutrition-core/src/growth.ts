import { assertRange } from './errors';
import { WHO_LMS, type LmsSeries } from './who-data';

/**
 * Crescimento de crianças e adolescentes pelos padrões da OMS: escore-z pelo método LMS.
 * 0 a 5 anos: WHO Child Growth Standards (2006), por dia de idade. 5 a 19 anos: WHO Reference 2007, por mês.
 * Pontos de corte: Ministério da Saúde/SISVAN (Orientações para a coleta e análise de dados antropométricos, 2011).
 * Fica fora do índice do pacote (pesa ~370 kB): importe de '@rafanutri/nutrition-core/growth', só no servidor.
 */

export type Sex = 'female' | 'male';
export type GrowthIndicator = 'wfa' | 'hfa' | 'bfa' | 'wfh' | 'hcfa';
export type GrowthLevel = 'ok' | 'attention' | 'alert';

export interface GrowthInput {
  sex: Sex;
  /** Idade em dias na data da medida (0 a 19 anos). */
  ageDays: number;
  weightKg?: number | null;
  /** Comprimento (deitado) ou estatura (em pé), em cm. */
  heightCm?: number | null;
  headCm?: number | null;
  /** Medido deitado? Padrão: deitado antes dos 2 anos, em pé depois. A OMS corrige 0,7 cm quando foge do padrão. */
  measuredLying?: boolean | null;
}

export interface GrowthResult {
  indicator: GrowthIndicator;
  label: string;
  /** Valor medido usado no cálculo (peso, estatura corrigida, IMC ou perímetro). */
  value: number;
  z: number;
  percentile: number;
  classification: string;
  level: GrowthLevel;
}

export const GROWTH_LABEL: Record<GrowthIndicator, string> = {
  wfa: 'Peso para a idade',
  hfa: 'Estatura para a idade',
  bfa: 'IMC para a idade',
  wfh: 'Peso para a estatura',
  hcfa: 'Perímetro cefálico para a idade',
};

const DAYS_5Y = 1856; // último dia das tabelas de 0 a 5 anos
const DAYS_PER_MONTH = 30.4375;
const MAX_DAYS = Math.round(19 * 365.25);

const sexKey = (s: Sex): 1 | 2 => (s === 'male' ? 1 : 2);

/** L, M e S no ponto x (interpolação linear entre as linhas da tabela). Null fora da faixa. */
export function lmsAt(series: LmsSeries, x: number): [number, number, number] | null {
  const pos = (x - series.start) / series.step;
  const last = series.lms.length / 3 - 1;
  if (pos < -1e-9 || pos > last + 1e-9) return null;
  const i = Math.min(Math.floor(pos + 1e-9), last);
  const f = Math.min(Math.max(pos - i, 0), 1);
  const at = (k: number, o: number) => series.lms[k * 3 + o]!;
  if (f < 1e-9 || i === last) return [at(i, 0), at(i, 1), at(i, 2)];
  return [0, 1, 2].map((o) => at(i, o) + (at(i + 1, o) - at(i, o)) * f) as [number, number, number];
}

/** Escore-z pelo LMS; `restricted` aplica o ajuste da OMS acima de +3 e abaixo de -3 (indicadores de peso). */
export function lmsZ(y: number, [L, M, S]: [number, number, number], restricted = false): number {
  const z = Math.abs(L) < 1e-9 ? Math.log(y / M) / S : ((y / M) ** L - 1) / (L * S);
  if (!restricted || Math.abs(z) <= 3) return z;
  const sd = (k: number) => M * (1 + L * S * k) ** (1 / L);
  if (z > 3) return 3 + (y - sd(3)) / (sd(3) - sd(2));
  return -3 + (y - sd(-3)) / (sd(-2) - sd(-3));
}

/** Percentil (0 a 100) do escore-z (normal padrão). */
export function zToPercentile(z: number): number {
  // Aproximação de Abramowitz e Stegun 26.2.17 (erro < 7,5e-8).
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return (z > 0 ? 1 - p : p) * 100;
}

function classify(indicator: GrowthIndicator, z: number, under5: boolean): { classification: string; level: GrowthLevel } {
  switch (indicator) {
    case 'wfa':
      if (z < -3) return { classification: 'Muito baixo peso para a idade', level: 'alert' };
      if (z < -2) return { classification: 'Baixo peso para a idade', level: 'alert' };
      if (z <= 2) return { classification: 'Peso adequado para a idade', level: 'ok' };
      return { classification: 'Peso elevado para a idade', level: 'attention' };
    case 'hfa':
      if (z < -3) return { classification: 'Muito baixa estatura para a idade', level: 'alert' };
      if (z < -2) return { classification: 'Baixa estatura para a idade', level: 'alert' };
      return { classification: 'Estatura adequada para a idade', level: 'ok' };
    case 'hcfa':
      if (z < -2) return { classification: 'Perímetro cefálico abaixo do esperado', level: 'alert' };
      if (z > 2) return { classification: 'Perímetro cefálico acima do esperado', level: 'alert' };
      return { classification: 'Perímetro cefálico adequado', level: 'ok' };
    default: {
      if (z < -3) return { classification: 'Magreza acentuada', level: 'alert' };
      if (z < -2) return { classification: 'Magreza', level: 'alert' };
      if (z <= 1) return { classification: 'Eutrofia', level: 'ok' };
      if (under5) {
        if (z <= 2) return { classification: 'Risco de sobrepeso', level: 'attention' };
        if (z <= 3) return { classification: 'Sobrepeso', level: 'alert' };
        return { classification: 'Obesidade', level: 'alert' };
      }
      if (z <= 2) return { classification: 'Sobrepeso', level: 'attention' };
      if (z <= 3) return { classification: 'Obesidade', level: 'alert' };
      return { classification: 'Obesidade grave', level: 'alert' };
    }
  }
}

function result(indicator: GrowthIndicator, value: number, lms: [number, number, number] | null, restricted: boolean, under5: boolean): GrowthResult | null {
  if (!lms) return null;
  const z = Math.round(lmsZ(value, lms, restricted) * 100) / 100;
  return { indicator, label: GROWTH_LABEL[indicator], value: Math.round(value * 100) / 100, z, percentile: Math.round(zToPercentile(z) * 10) / 10, ...classify(indicator, z, under5) };
}

/**
 * Indicadores de crescimento de uma medida. Até 5 anos: peso, comprimento/estatura, IMC, peso para a estatura e
 * perímetro cefálico por idade. De 5 a 19 anos: IMC e estatura por idade (e peso por idade até 10 anos).
 */
export function growthIndicators(input: GrowthInput): GrowthResult[] {
  assertRange('ageDays', input.ageDays, 0, MAX_DAYS);
  const sex = sexKey(input.sex);
  const days = Math.round(input.ageDays);
  const under5 = days <= DAYS_5Y;
  const out: Array<GrowthResult | null> = [];
  const w = input.weightKg ?? null;
  let h = input.heightCm ?? null;
  if (w !== null) assertRange('weightKg', w, 0.5, 250);
  if (h !== null) assertRange('heightCm', h, 35, 230);

  if (under5) {
    if (h !== null) {
      const lying = input.measuredLying ?? days < 731;
      if (days < 731 && !lying) h += 0.7;
      if (days >= 731 && lying) h -= 0.7;
    }
    if (w !== null) out.push(result('wfa', w, lmsAt(WHO_LMS.wfa![sex], days), true, true));
    if (h !== null) out.push(result('hfa', h, lmsAt(WHO_LMS.lhfa![sex], days), false, true));
    if (w !== null && h !== null) {
      out.push(result('bfa', w / (h / 100) ** 2, lmsAt(WHO_LMS.bfa![sex], days), true, true));
      const table = days < 731 ? WHO_LMS.wfl![sex] : WHO_LMS.wfh![sex];
      out.push(result('wfh', w, lmsAt(table, Math.round(h * 10) / 10), true, true));
    }
    if (input.headCm != null) {
      assertRange('headCm', input.headCm, 25, 60);
      out.push(result('hcfa', input.headCm, lmsAt(WHO_LMS.hcfa![sex], days), false, true));
    }
  } else {
    const months = days / DAYS_PER_MONTH;
    if (w !== null) out.push(result('wfa', w, lmsAt(WHO_LMS.wfa2007![sex], months), true, false));
    if (h !== null) out.push(result('hfa', h, lmsAt(WHO_LMS.hfa2007![sex], months), false, false));
    if (w !== null && h !== null) out.push(result('bfa', w / (h / 100) ** 2, lmsAt(WHO_LMS.bfa2007![sex], months), true, false));
  }
  return out.filter((r): r is GrowthResult => r !== null);
}

/** Valor da curva de escore-z `z` na idade (dias), para desenhar as linhas de referência do gráfico. */
export function growthCurveValue(indicator: 'wfa' | 'hfa' | 'bfa', sex: Sex, ageDays: number, z: number): number | null {
  const s = sexKey(sex);
  const under5 = ageDays <= DAYS_5Y;
  const table = under5
    ? WHO_LMS[indicator === 'hfa' ? 'lhfa' : indicator]![s]
    : WHO_LMS[indicator === 'wfa' ? 'wfa2007' : indicator === 'hfa' ? 'hfa2007' : 'bfa2007']![s];
  const lms = lmsAt(table, under5 ? Math.round(ageDays) : ageDays / DAYS_PER_MONTH);
  if (!lms) return null;
  const [L, M, S] = lms;
  return Math.abs(L) < 1e-9 ? M * Math.exp(S * z) : M * (1 + L * S * z) ** (1 / L);
}

export interface GrowthPoint {
  date: string;
  results: GrowthResult[];
}

export interface GrowthAlert {
  date: string;
  indicator: GrowthIndicator;
  message: string;
  level: GrowthLevel;
}

/**
 * Alertas de desvio: classificação fora da faixa adequada na última medida e mudança de 1 escore-z ou mais
 * entre duas medidas seguidas (cruzar linhas da curva), que pede investigação mesmo dentro da faixa.
 */
export function growthAlerts(points: GrowthPoint[]): GrowthAlert[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const alerts: GrowthAlert[] = [];
  const last = sorted.at(-1);
  if (last) {
    for (const r of last.results) if (r.level !== 'ok') alerts.push({ date: last.date, indicator: r.indicator, level: r.level, message: `${r.label}: ${r.classification.toLowerCase()} (escore-z ${fmt(r.z)}).` });
  }
  for (let i = 1; i < sorted.length; i += 1) {
    for (const cur of sorted[i]!.results) {
      const prev = sorted[i - 1]!.results.find((r) => r.indicator === cur.indicator);
      if (!prev) continue;
      const d = cur.z - prev.z;
      if (Math.abs(d) >= 1) {
        alerts.push({ date: sorted[i]!.date, indicator: cur.indicator, level: 'attention', message: `${cur.label}: ${d < 0 ? 'queda' : 'aumento'} de ${fmt(Math.abs(d))} escore-z desde a medida anterior.` });
      }
    }
  }
  return alerts;
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Idade em dias entre o nascimento e a data (AAAA-MM-DD). */
export function ageInDays(birthDate: string, onDate: string): number {
  return Math.round((Date.parse(`${onDate}T12:00:00Z`) - Date.parse(`${birthDate}T12:00:00Z`)) / 864e5);
}
