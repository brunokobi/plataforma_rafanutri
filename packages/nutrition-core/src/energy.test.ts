import { describe, expect, it } from 'vitest';
import {
  compareEnergyFormulas, cunningham, faoWho1985, harrisBenedict, mifflinStJeor, totalEnergyExpenditure,
} from './energy';
import { NutritionInputError } from './errors';

const man = { sex: 'male' as const, weightKg: 80, heightCm: 180, ageYears: 30 };
const woman = { sex: 'female' as const, weightKg: 60, heightCm: 165, ageYears: 25 };

describe('fórmulas de gasto energético de repouso', () => {
  it('Harris-Benedict', () => {
    expect(harrisBenedict(man)).toBeCloseTo(1864.36, 2);
    expect(harrisBenedict(woman)).toBeCloseTo(1417.23, 2);
  });
  it('Mifflin-St Jeor', () => {
    expect(mifflinStJeor(man)).toBeCloseTo(1780, 5);
    expect(mifflinStJeor(woman)).toBeCloseTo(1345.25, 5);
  });
  it('Cunningham exige massa magra', () => {
    expect(cunningham({ ...man, leanMassKg: 60 })).toBe(1820);
    expect(() => cunningham(man)).toThrow(NutritionInputError);
  });
  it('FAO/OMS 1985 por faixa etária', () => {
    expect(faoWho1985({ ...man, weightKg: 70, ageYears: 25 })).toBeCloseTo(1750, 5);
    expect(faoWho1985({ ...woman, ageYears: 45 })).toBeCloseTo(1351, 5);
    expect(faoWho1985({ ...man, weightKg: 70, ageYears: 65 })).toBeCloseTo(1432, 5);
  });
  it('não aceita menores de 18 anos (equações pediátricas ficam na Fase 4)', () => {
    expect(() => mifflinStJeor({ ...man, ageYears: 17 })).toThrow(NutritionInputError);
  });
  it('comparativo deixa null a fórmula sem dado', () => {
    const r = compareEnergyFormulas(man);
    expect(r.cunningham).toBeNull();
    expect(r.mifflin_st_jeor).toBeCloseTo(1780, 5);
  });
  it('GET = GER × fator de atividade', () => {
    expect(totalEnergyExpenditure(1780, 1.55)).toBeCloseTo(2759, 5);
  });
});
