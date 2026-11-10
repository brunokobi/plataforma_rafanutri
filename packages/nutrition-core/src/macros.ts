import { assertRange } from './errors';

export const KCAL_PER_GRAM = { protein: 4, carbohydrate: 4, lipid: 9, alcohol: 7 } as const;
export type Macro = 'protein' | 'carbohydrate' | 'lipid';

/** Meta de um macronutriente em uma das três formas aceitas. */
export type MacroTarget =
  | { mode: 'g_per_kg'; value: number }
  | { mode: 'pct'; value: number }
  | { mode: 'grams'; value: number };

export interface MacroResolved {
  grams: number;
  kcal: number;
  pct: number;
  gPerKg: number;
}

/** Converte uma meta para gramas, kcal, % do valor energético e g/kg. */
export function resolveMacro(macro: Macro, target: MacroTarget, energyKcal: number, weightKg: number): MacroResolved {
  assertRange('energyKcal', energyKcal, 300, 10000);
  assertRange('weightKg', weightKg, 1, 400);
  assertRange('targetValue', target.value, 0, target.mode === 'pct' ? 100 : 2000);
  const factor = KCAL_PER_GRAM[macro];
  let grams: number;
  switch (target.mode) {
    case 'g_per_kg':
      grams = target.value * weightKg;
      break;
    case 'pct':
      grams = (energyKcal * target.value) / 100 / factor;
      break;
    case 'grams':
      grams = target.value;
      break;
  }
  const kcal = grams * factor;
  return { grams, kcal, pct: (kcal / energyKcal) * 100, gPerKg: grams / weightKg };
}

export interface MacroDistribution {
  protein: MacroResolved;
  carbohydrate: MacroResolved;
  lipid: MacroResolved;
  totalKcal: number;
  /** Diferença entre a soma dos macros e a meta energética (kcal). */
  deltaKcal: number;
}

export function macroDistribution(
  targets: Record<Macro, MacroTarget>,
  energyKcal: number,
  weightKg: number,
): MacroDistribution {
  const protein = resolveMacro('protein', targets.protein, energyKcal, weightKg);
  const carbohydrate = resolveMacro('carbohydrate', targets.carbohydrate, energyKcal, weightKg);
  const lipid = resolveMacro('lipid', targets.lipid, energyKcal, weightKg);
  const totalKcal = protein.kcal + carbohydrate.kcal + lipid.kcal;
  return { protein, carbohydrate, lipid, totalKcal, deltaKcal: totalKcal - energyKcal };
}
