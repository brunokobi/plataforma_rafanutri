import { assessGestationalGain, bmi, classifyPrePregnancyBmi, dueDate, gainBand, gestationalWeeks, PRE_PREGNANCY_LABEL, type GainAssessment, type PrePregnancyBmiClass } from '@rafanutri/nutrition-core';
import { ageInDays, growthAlerts, growthCurveValue, growthIndicators, type GrowthAlert, type GrowthResult, type Sex } from '@rafanutri/nutrition-core/growth';
import type { MaternalMeasurement, Pregnancy } from './types';

export type CurveIndicator = 'wfa' | 'hfa' | 'bfa';
export const CURVE_LABEL: Record<CurveIndicator, { title: string; unit: string }> = {
  wfa: { title: 'Peso para a idade', unit: 'kg' },
  hfa: { title: 'Estatura para a idade', unit: 'cm' },
  bfa: { title: 'IMC para a idade', unit: 'kg/m²' },
};

export const CHILD_MAX_DAYS = Math.round(19 * 365.25);

export interface ChartSeries {
  /** Escore-z da linha (-3, -2, 0, 2, 3). */
  z: number;
  points: Array<[number, number]>;
}

export interface ChildView {
  rows: Array<{ id: string; date: string; ageLabel: string; results: GrowthResult[] }>;
  alerts: GrowthAlert[];
  chart: { indicator: CurveIndicator; xUnit: 'meses' | 'anos'; xMax: number; curves: ChartSeries[]; points: Array<[number, number]> } | null;
}

/** "1 ano e 3 meses", "8 meses", "12 anos". */
export function ageLabel(days: number): string {
  const months = Math.floor(days / 30.4375);
  if (months < 1) return `${days} dia${days === 1 ? '' : 's'}`;
  if (months < 24) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
    return `1 ano${m ? ` e ${m} ${m === 1 ? 'mês' : 'meses'}` : ''}`;
  }
  const y = Math.floor(days / 365.25);
  const m = Math.floor((days / 30.4375) % 12);
  return `${y} anos${y < 10 && m ? ` e ${m} ${m === 1 ? 'mês' : 'meses'}` : ''}`;
}

/** Curvas da OMS e medidas da criança/adolescente para a tabela, os alertas e o gráfico. */
export function childView(sex: Sex, birthDate: string, measurements: MaternalMeasurement[], indicator: CurveIndicator): ChildView {
  const rows: ChildView['rows'] = [];
  for (const m of measurements) {
    const days = ageInDays(birthDate, m.assessed_at);
    if (days < 0 || days > CHILD_MAX_DAYS) continue;
    try {
      const results = growthIndicators({ sex, ageDays: days, weightKg: m.weight_kg, heightCm: m.height_cm, headCm: m.head_circumference_cm, measuredLying: m.measured_lying });
      if (results.length) rows.push({ id: m.id, date: m.assessed_at, ageLabel: ageLabel(days), results });
    } catch {
      // medida fora das faixas das tabelas: fica de fora das curvas
    }
  }
  const alerts = growthAlerts(rows.map((r) => ({ date: r.date, results: r.results })));

  const pts = rows
    .map((r) => [ageInDays(birthDate, r.date), r.results.find((x) => x.indicator === indicator)?.value] as const)
    .filter((p): p is readonly [number, number] => typeof p[1] === 'number');
  if (pts.length === 0) return { rows: rows.reverse(), alerts, chart: null };

  const lastDays = Math.max(...pts.map((p) => p[0]));
  const years = lastDays > 1856;
  // Janela: até 5 anos em meses; depois em anos, de 5 a 19 (o IMC e a estatura da OMS 2007 começam aos 5).
  const xMaxDays = years ? Math.min(CHILD_MAX_DAYS, Math.max(lastDays + 365, 1857 + 365 * 3)) : Math.min(1856, Math.max(lastDays + 90, 365));
  const xMinDays = years ? 1857 : 0;
  const toX = (d: number) => (years ? d / 365.25 : d / 30.4375);
  const step = Math.max(1, Math.round((xMaxDays - xMinDays) / 120));
  const curves: ChartSeries[] = [-3, -2, 0, 2, 3].map((z) => {
    const points: Array<[number, number]> = [];
    for (let d = xMinDays; d <= xMaxDays; d += step) {
      if (indicator === 'wfa' && d > 3652) break; // peso para a idade só até 10 anos
      const v = growthCurveValue(indicator, sex, d, z);
      if (v !== null && Number.isFinite(v)) points.push([toX(d), v]);
    }
    return { z, points };
  });
  return {
    rows: rows.reverse(),
    alerts,
    chart: { indicator, xUnit: years ? 'anos' : 'meses', xMax: toX(xMaxDays), curves, points: pts.filter((p) => p[0] >= xMinDays).map(([d, v]) => [toX(d), v]) },
  };
}

export interface PregnancyView {
  pregnancy: Pregnancy;
  weeksNow: number | null;
  due: string;
  bmi: number;
  cls: PrePregnancyBmiClass;
  clsLabel: string;
  band: Array<{ week: number; min: number; max: number }>;
  rows: Array<{ id: string; date: string; weight: number; assessment: GainAssessment }>;
  latest: GainAssessment | null;
}

/** Ganho de peso da gestação: semanas, faixa recomendada e cada pesagem dentro do período. */
export function pregnancyView(p: Pregnancy, measurements: MaternalMeasurement[], today: string): PregnancyView {
  const preBmi = Math.round(bmi(p.pre_pregnancy_weight_kg, p.height_cm) * 10) / 10;
  const cls = classifyPrePregnancyBmi(preBmi);
  const end = p.ended_on ?? today;
  const rows: PregnancyView['rows'] = [];
  for (const m of measurements) {
    if (m.weight_kg == null || m.assessed_at < p.lmp_date || m.assessed_at > end) continue;
    const weeks = gestationalWeeks(p.lmp_date, m.assessed_at);
    if (weeks < 0 || weeks > 44 || m.weight_kg < 25) continue;
    rows.push({ id: m.id, date: m.assessed_at, weight: m.weight_kg, assessment: assessGestationalGain({ cls, prePregnancyKg: p.pre_pregnancy_weight_kg, currentKg: m.weight_kg, weeks }) });
  }
  const weeksNow = p.status === 'active' ? Math.round(gestationalWeeks(p.lmp_date, today) * 10) / 10 : null;
  return { pregnancy: p, weeksNow, due: dueDate(p.lmp_date), bmi: preBmi, cls, clsLabel: PRE_PREGNANCY_LABEL[cls], band: gainBand(cls), rows: rows.reverse(), latest: rows.at(0)?.assessment ?? null };
}

/** "20 semanas e 3 dias". */
export function weeksLabel(weeks: number): string {
  const w = Math.floor(weeks + 1e-9);
  const d = Math.round((weeks - w) * 7);
  return `${w} semana${w === 1 ? '' : 's'}${d ? ` e ${d} dia${d === 1 ? '' : 's'}` : ''}`;
}
