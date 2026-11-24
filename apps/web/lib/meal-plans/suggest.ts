import { lactationEnergyAddition, mifflinStJeor, pregnancyEnergyAddition } from '@rafanutri/nutrition-core';
import type { PlanMode } from './schema';

/**
 * Sugestões de modelo de plano para a ficha do paciente (função pura).
 * Junta os sinais do paciente (idade, tipo de acompanhamento, gestação/lactação, objetivo e anamnese) em
 * "famílias" de modelo, escolhe em cada família o modelo de energia mais próxima da meta e explica o motivo.
 * Nunca decide sozinho: o nutricionista revisa o rascunho criado.
 */

export interface SuggestTemplate {
  id: string;
  name: string;
  tags: string[];
  mode: PlanMode;
  energy_kcal: number | null;
  /** Do consultório (true) ou da biblioteca (false). */
  own?: boolean;
}

export interface SuggestSignals {
  ageYears: number | null;
  sex: 'female' | 'male' | null;
  careProfile: 'clinical' | 'sport' | 'maternal' | null;
  objective: string | null;
  /** Texto das respostas da anamnese mais recente (ver anamnesisSignalText). */
  anamnesisText: string;
  /** Semanas de gestação se houver gestação ativa. */
  pregnancyWeeks: number | null;
  /** Meses de lactação se houver lactação ativa. */
  lactationMonths: number | null;
  weightKg: number | null;
  heightCm: number | null;
  /** Energia do plano publicado, se houver (prioridade sobre a estimativa). */
  planKcal: number | null;
}

export interface Suggestion {
  template: SuggestTemplate;
  reasons: string[];
  /** Meta para "Ajustar à meta" (null = usar o modelo como está; sempre null no qualitativo). */
  targetKcal: number | null;
  family: string;
}

export interface EnergyTarget { kcal: number; source: 'plan' | 'estimate'; detail: string }

interface Family {
  key: string;
  /** Casa o modelo pela etiqueta ou pelo nome (minúsculo, sem acento). */
  match: (t: SuggestTemplate) => boolean;
  weight: number;
  reason: string;
}

export const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const hasTag = (t: SuggestTemplate, tag: string) => t.tags.some((x) => norm(x) === norm(tag));

const RX = {
  ed: /anorex|bulimi|transtorno(s)? alimentar|\btca\b|purgac|vomito(s)? provocad/,
  binge: /compuls|\btcap\b|episodios? de exagero|comer escondido/,
  diabetes: /diabet|glicemi|glicose alta|resistencia (a )?insulina|\bdm ?(1|2)\b|hemoglobina glicada/,
  hypertension: /hipertens|pressao alta|\bhas\b/,
  lipids: /colesterol|triglicer|dislipidemi|ldl alto|hipercolesterol/,
  gastric: /gastrite|refluxo|azia|\bdrge\b|queimacao|ulcera/,
  constipation: /constipa|intestino preso|prisao de ventre|evacua(r|cao) (com )?dificuldade/,
  vegan: /vegan/,
  vegetarian: /vegetarian|nao (come|consome) carne/,
  weightLoss: /emagrec|perder peso|perda de peso|obesidade|sobrepeso|reduzir (o )?peso/,
  hypertrophy: /hipertrofi|ganh(ar|o de) massa|massa muscular|ganhar peso|bulking/,
  endurance: /corrida|maratona|meia maratona|ciclismo|triatlo|triathlon|endurance|natacao|corredor/,
  cutting: /defini(cao|r)|cutting|secar|percentual de gordura/,
  cardio: /cardiovascular|infarto|avc|coracao/,
};

/** Famílias que fazem sentido para o paciente, em ordem de prioridade. */
export function familiesFor(s: SuggestSignals): Family[] {
  const text = norm(`${s.objective ?? ''} ${s.anamnesisText}`);
  const age = s.ageYears;
  const out: Family[] = [];
  const add = (key: string, weight: number, reason: string, match: Family['match']) => {
    const f = out.find((x) => x.key === key);
    if (f) { f.weight = Math.max(f.weight, weight); if (!f.reason.includes(reason)) f.reason += `; ${reason}`; return; }
    out.push({ key, weight, reason, match });
  };

  const ed = RX.ed.test(text);
  const binge = RX.binge.test(text);
  if (ed) add('ta_estruturado', 100, 'anamnese cita transtorno alimentar', (t) => hasTag(t, 'transtorno alimentar') && !hasTag(t, 'compulsão alimentar'));
  if (binge) add('ta_compulsao', 100, 'anamnese cita compulsão alimentar', (t) => hasTag(t, 'compulsão alimentar'));
  const eatingDisorder = ed || binge;

  if (age !== null && age < 18) {
    if (age < 1) { /* bebê: aleitamento e introdução alimentar ficam no módulo materno-infantil */ }
    else if (age < 4) add('primeira_infancia', 90, `criança de ${Math.floor(age)} ano(s)`, (t) => hasTag(t, 'primeira infância'));
    else if (age < 6) add('pre_escolar', 90, `criança de ${Math.floor(age)} anos`, (t) => hasTag(t, 'pré-escolar'));
    else if (age < 11) add('escolar', 90, `criança de ${Math.floor(age)} anos`, (t) => hasTag(t, 'escolar'));
    else add('adolescente', 90, `adolescente de ${Math.floor(age)} anos`, (t) => hasTag(t, 'adolescente'));
  }
  if (s.pregnancyWeeks !== null) add('gestante', 95, `gestante (${Math.floor(s.pregnancyWeeks)} semanas)`, (t) => hasTag(t, 'gestante'));
  if ((s.lactationMonths !== null)) add('lactante', 95, 'amamentando', (t) => hasTag(t, 'lactante'));
  if (age !== null && age >= 60) add('idoso', 70, `pessoa idosa (${Math.floor(age)} anos)`, (t) => hasTag(t, 'pessoa idosa'));

  if (RX.diabetes.test(text)) add('glicemico', 85, 'diabetes ou glicemia alterada', (t) => hasTag(t, 'controle glicêmico'));
  if (RX.hypertension.test(text)) add('dash', 80, 'hipertensão', (t) => hasTag(t, 'dash'));
  if (RX.lipids.test(text)) add('dislipidemia', 80, 'colesterol ou triglicerídeos', (t) => hasTag(t, 'dislipidemia'));
  if (RX.gastric.test(text)) add('gastrite', 80, 'gastrite ou refluxo', (t) => hasTag(t, 'gastrite'));
  if (RX.constipation.test(text)) add('constipacao', 75, 'intestino preso', (t) => hasTag(t, 'constipação'));
  if (RX.cardio.test(text)) add('mediterraneo', 60, 'saúde cardiovascular', (t) => hasTag(t, 'mediterrâneo'));
  if (RX.vegan.test(text)) add('vegano', 85, 'vegano', (t) => hasTag(t, 'vegano'));
  else if (RX.vegetarian.test(text)) add('vegetariano', 85, 'vegetariano', (t) => hasTag(t, 'vegetariano') && !hasTag(t, 'vegano'));

  const adult = age === null || age >= 18;
  const sport = s.careProfile === 'sport' || RX.hypertrophy.test(text) || RX.endurance.test(text) || RX.cutting.test(text);
  if (sport && adult && !eatingDisorder) {
    const why = s.careProfile === 'sport' ? 'perfil esportivo' : 'objetivo esportivo';
    if (RX.endurance.test(text)) add('endurance', 75, `${why}: endurance`, (t) => hasTag(t, 'endurance'));
    if (RX.cutting.test(text)) add('definicao', 75, `${why}: definição`, (t) => hasTag(t, 'definição'));
    if (RX.hypertrophy.test(text) || (!RX.endurance.test(text) && !RX.cutting.test(text))) add('hipertrofia', 72, `${why}: hipertrofia`, (t) => hasTag(t, 'hipertrofia'));
    if (s.careProfile === 'sport' && !RX.endurance.test(text)) add('endurance', 50, 'perfil esportivo', (t) => hasTag(t, 'endurance'));
  }
  // Emagrecimento nunca é sugerido junto de transtorno alimentar, para criança ou na gestação/lactação.
  if (RX.weightLoss.test(text) && adult && !eatingDisorder && s.pregnancyWeeks === null && !(s.lactationMonths !== null)) {
    add('emagrecimento', 78, 'objetivo de perder peso', (t) => hasTag(t, 'emagrecimento'));
  }
  if (adult && !eatingDisorder && s.pregnancyWeeks === null && !(s.lactationMonths !== null)) {
    add('tradicional', 30, 'padrão do Guia Alimentar', (t) => hasTag(t, 'tradicional'));
    add('mediterraneo', 25, 'padrão saudável', (t) => hasTag(t, 'mediterrâneo'));
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/**
 * Meta de energia: o plano publicado vale mais; sem ele, Mifflin-St Jeor × 1,55 com ajuste pelo objetivo e o
 * adicional de gestação/lactação. Sem dados (ou menor de 18 anos), null: a sugestão usa o modelo como está.
 */
export function energyTarget(s: SuggestSignals): EnergyTarget | null {
  if (s.planKcal && s.planKcal >= 600) return { kcal: Math.round(s.planKcal), source: 'plan', detail: 'energia do plano publicado' };
  if (!s.sex || !s.weightKg || !s.heightCm || s.ageYears === null || s.ageYears < 18) return null;
  let kcal: number;
  try {
    kcal = mifflinStJeor({ sex: s.sex, weightKg: s.weightKg, heightCm: s.heightCm, ageYears: s.ageYears }) * 1.55;
  } catch {
    return null;
  }
  const text = norm(`${s.objective ?? ''} ${s.anamnesisText}`);
  const parts = ['Mifflin-St Jeor × 1,55'];
  const ed = RX.ed.test(text) || RX.binge.test(text);
  if (s.pregnancyWeeks !== null) {
    const add = pregnancyEnergyAddition(s.pregnancyWeeks);
    if (add) { kcal += add; parts.push(`+${add} kcal da gestação`); }
  } else if (s.lactationMonths !== null) {
    const add = lactationEnergyAddition(s.lactationMonths);
    if (add) { kcal += add; parts.push(`+${add} kcal da lactação`); }
  } else if (!ed && RX.weightLoss.test(text)) {
    kcal -= 500; parts.push('−500 kcal para perda de peso');
  } else if (!ed && RX.hypertrophy.test(text)) {
    kcal += 300; parts.push('+300 kcal para ganho de massa');
  }
  const floor = s.sex === 'male' ? 1500 : 1200;
  kcal = Math.max(floor, Math.min(6000, kcal));
  return { kcal: Math.round(kcal / 50) * 50, source: 'estimate', detail: parts.join(' ') };
}

/** Modelo da família com energia mais próxima da meta (sem meta: o do meio). Modelos do consultório ganham no empate. */
function pick(cands: SuggestTemplate[], target: number | null): SuggestTemplate | null {
  if (!cands.length) return null;
  const sorted = [...cands].sort((a, b) => (a.energy_kcal ?? 0) - (b.energy_kcal ?? 0));
  if (target === null || sorted.every((t) => t.energy_kcal === null)) return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
  return sorted.reduce((best, t) => {
    const d = Math.abs((t.energy_kcal ?? Infinity) - target);
    const bd = Math.abs((best.energy_kcal ?? Infinity) - target);
    return d < bd || (d === bd && t.own && !best.own) ? t : best;
  });
}

export function suggestTemplates(templates: SuggestTemplate[], s: SuggestSignals, limit = 4): { suggestions: Suggestion[]; target: EnergyTarget | null } {
  const target = energyTarget(s);
  const suggestions: Suggestion[] = [];
  for (const f of familiesFor(s)) {
    if (suggestions.length >= limit) break;
    const t = pick(templates.filter(f.match), target?.kcal ?? null);
    if (!t || suggestions.some((x) => x.template.id === t.id)) continue;
    const quantitative = t.mode !== 'qualitative' && Boolean(t.energy_kcal);
    suggestions.push({ template: t, reasons: f.reason.split('; '), targetKcal: quantitative && target ? target.kcal : null, family: f.key });
  }
  return { suggestions, target };
}
