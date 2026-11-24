import { describe, expect, it } from 'vitest';
import { energyTarget, suggestTemplates, type SuggestSignals, type SuggestTemplate } from '@/lib/meal-plans/suggest';

const T = (name: string, tags: string[], kcal: number | null, mode: 'quantitative' | 'qualitative' = 'quantitative'): SuggestTemplate =>
  ({ id: `${name}-${kcal}`, name: `${name}${kcal ? ` — ${kcal}` : ''}`, tags: ['biblioteca', ...tags], mode, energy_kcal: kcal });
const LIB: SuggestTemplate[] = [
  ...[1200, 1500, 1800, 2000, 2200, 2500].map((k) => T('Tradicional', ['tradicional'], k)),
  ...[1200, 1500, 1800, 2200].map((k) => T('Mediterrâneo', ['mediterrâneo'], k)),
  ...[1200, 1500, 1800, 2000].map((k) => T('Glicêmico', ['controle glicêmico', 'diabetes'], k)),
  ...[1200, 1800, 2200].map((k) => T('DASH', ['dash', 'hipertensão'], k)),
  ...[1200, 1400, 1600, 1800].map((k) => T('Emagrecimento', ['emagrecimento'], k)),
  ...[2200, 2500, 2800].map((k) => T('Hipertrofia', ['esportivo', 'hipertrofia'], k)),
  ...[2200, 2800].map((k) => T('Endurance', ['esportivo', 'endurance'], k)),
  ...[2000, 2300, 2600].map((k) => T('Gestante', ['gestante'], k)),
  ...[2300, 2500].map((k) => T('Lactante', ['lactante'], k)),
  ...[1000, 1200].map((k) => T('1 a 3 anos', ['primeira infância'], k)),
  ...[1400, 1700].map((k) => T('Escolar', ['escolar', 'infantil'], k)),
  ...[2000, 2400].map((k) => T('Adolescente', ['adolescente'], k)),
  T('TA regular', ['transtorno alimentar', 'anorexia', 'bulimia'], null, 'qualitative'),
  T('TA compulsão', ['transtorno alimentar', 'compulsão alimentar'], null, 'qualitative'),
];
const base: SuggestSignals = { ageYears: 40, sex: 'female', careProfile: 'clinical', objective: null, anamnesisText: '', pregnancyWeeks: null, lactationMonths: null, weightKg: 70, heightCm: 165, planKcal: null };
const fams = (s: Partial<SuggestSignals>) => suggestTemplates(LIB, { ...base, ...s }).suggestions.map((x) => x.family);

describe('sugestões de plano', () => {
  it('meta: plano publicado vale mais; sem ele, Mifflin × 1,55 com ajuste do objetivo', () => {
    expect(energyTarget({ ...base, planKcal: 1750 })).toMatchObject({ kcal: 1750, source: 'plan' });
    const est = energyTarget(base)!; // 10×70 + 6,25×165 − 5×40 − 161 = 1370,25 × 1,55 ≈ 2124 → 2100
    expect(est).toMatchObject({ kcal: 2100, source: 'estimate' });
    expect(energyTarget({ ...base, objective: 'Emagrecer' })!.kcal).toBe(1600);
    expect(energyTarget({ ...base, pregnancyWeeks: 30 })!.kcal).toBe(2600);
    expect(energyTarget({ ...base, ageYears: 12 })).toBeNull();
    expect(energyTarget({ ...base, weightKg: null })).toBeNull();
  });

  it('doenças da anamnese e objetivo viram famílias, com o modelo mais perto da meta', () => {
    const r = suggestTemplates(LIB, { ...base, anamnesisText: 'Diabetes tipo 2 | Hipertensão', objective: 'perder peso' });
    expect(r.suggestions.map((s) => s.family)).toEqual(['glicemico', 'dash', 'emagrecimento', 'tradicional']);
    expect(r.suggestions[0]!.template.energy_kcal).toBe(1500); // meta 1600
    expect(r.suggestions[0]!.targetKcal).toBe(1600);
    expect(r.suggestions[0]!.reasons).toEqual(['diabetes ou glicemia alterada']);
  });

  it('transtorno alimentar: qualitativo primeiro e nunca emagrecimento ou meta', () => {
    const r = suggestTemplates(LIB, { ...base, objective: 'emagrecer', anamnesisText: 'Bulimia há 2 anos' });
    expect(r.suggestions[0]!.family).toBe('ta_estruturado');
    expect(r.suggestions[0]!.targetKcal).toBeNull();
    expect(r.suggestions.map((s) => s.family)).not.toContain('emagrecimento');
    expect(fams({ anamnesisText: 'episódios de compulsão à noite' })[0]).toBe('ta_compulsao');
  });

  it('gestação, lactação, criança e esporte', () => {
    expect(fams({ pregnancyWeeks: 20 })[0]).toBe('gestante');
    expect(fams({ pregnancyWeeks: 20, objective: 'emagrecer' })).not.toContain('emagrecimento');
    expect(fams({ lactationMonths: 3 })[0]).toBe('lactante');
    expect(fams({ ageYears: 2, weightKg: 12, heightCm: 85 })).toEqual(['primeira_infancia']);
    expect(fams({ ageYears: 0 })).toEqual([]);
    expect(fams({ ageYears: 14 })[0]).toBe('adolescente');
    expect(fams({ careProfile: 'sport', sex: 'male', weightKg: 80, heightCm: 180, ageYears: 28 }).slice(0, 2)).toEqual(['hipertrofia', 'endurance']);
    expect(fams({ objective: 'treino para maratona' })[0]).toBe('endurance');
  });

  it('não sugere pelo que a anamnese não cita e limita a 4', () => {
    expect(fams({})).toEqual(['tradicional', 'mediterraneo']);
    expect(suggestTemplates(LIB, { ...base, anamnesisText: 'diabetes hipertensão colesterol vegano' }).suggestions.length).toBeLessThanOrEqual(4);
  });
});
