// RN-162 a RN-164 — Rotulagem nutricional (RDC 429/2020 e IN 75/2020): tabela por 100 g/mL e por porção,
// %VD, arredondamento, valores não significativos, lupa frontal e declaração de alergênicos.
// Valores de referência, limites e regras de arredondamento estão marcados A VALIDAR com a RT antes do uso
// em rótulo comercial.

export type PhysicalState = 'solid' | 'liquid';
export type LabelNutrient =
  | 'energy_kcal' | 'carbohydrate_g' | 'total_sugar_g' | 'added_sugar_g' | 'protein_g'
  | 'lipid_g' | 'saturated_fat_g' | 'trans_fat_g' | 'fiber_g' | 'sodium_mg';

/** Ordem e nomes da tabela (IN 75/2020, Anexo XII — formato vertical). */
export const LABEL_ROWS: Array<{ key: LabelNutrient; label: string; unit: 'kcal' | 'g' | 'mg'; indent?: boolean }> = [
  { key: 'energy_kcal', label: 'Valor energético', unit: 'kcal' },
  { key: 'carbohydrate_g', label: 'Carboidratos', unit: 'g' },
  { key: 'total_sugar_g', label: 'Açúcares totais', unit: 'g', indent: true },
  { key: 'added_sugar_g', label: 'Açúcares adicionados', unit: 'g', indent: true },
  { key: 'protein_g', label: 'Proteínas', unit: 'g' },
  { key: 'lipid_g', label: 'Gorduras totais', unit: 'g' },
  { key: 'saturated_fat_g', label: 'Gorduras saturadas', unit: 'g', indent: true },
  { key: 'trans_fat_g', label: 'Gorduras trans', unit: 'g', indent: true },
  { key: 'fiber_g', label: 'Fibras alimentares', unit: 'g' },
  { key: 'sodium_mg', label: 'Sódio', unit: 'mg' },
];

/** Valores diários de referência para %VD (IN 75/2020, Anexo II; adultos). A VALIDAR. */
export const DAILY_VALUES: Partial<Record<LabelNutrient, number>> = {
  energy_kcal: 2000, carbohydrate_g: 300, added_sugar_g: 50, protein_g: 50, lipid_g: 65, saturated_fat_g: 20, fiber_g: 25, sodium_mg: 2000,
};

/** Quantidades não significativas por porção, declaradas como zero (IN 75/2020, Anexo IV). A VALIDAR. */
export const NOT_SIGNIFICANT: Record<LabelNutrient, number> = {
  energy_kcal: 4, carbohydrate_g: 0.5, total_sugar_g: 0.5, added_sugar_g: 0.5, protein_g: 0.5,
  lipid_g: 0.5, saturated_fat_g: 0.2, trans_fat_g: 0.1, fiber_g: 0.5, sodium_mg: 5,
};

/** Limites da lupa "ALTO EM" por 100 g (sólidos) ou 100 mL (líquidos) — IN 75/2020, Anexo XV. A VALIDAR. */
export const FRONT_LIMITS: Record<PhysicalState, { added_sugar: number; saturated_fat: number; sodium: number }> = {
  solid: { added_sugar: 15, saturated_fat: 6, sodium: 600 },
  liquid: { added_sugar: 7.5, saturated_fat: 3, sodium: 300 },
};
export type FrontWarning = 'added_sugar' | 'saturated_fat' | 'sodium';
export const FRONT_LABEL: Record<FrontWarning, string> = { added_sugar: 'AÇÚCAR ADICIONADO', saturated_fat: 'GORDURA SATURADA', sodium: 'SÓDIO' };

/** Arredondamento da declaração: energia e sódio inteiros; gramas com uma casa abaixo de 10 e inteiras a partir de 10. */
export function roundDeclared(key: LabelNutrient, value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (key === 'energy_kcal' || key === 'sodium_mg') return Math.round(value);
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

export interface LabelRow { key: LabelNutrient; label: string; unit: string; indent: boolean; per100: number | null; perPortion: number | null; vdPct: number | null }
export interface NutritionTable { portionG: number; rows: LabelRow[]; missing: LabelNutrient[] }

/**
 * Tabela nutricional a partir dos valores por 100 g (ou mL). Quantidade não significativa na porção vira 0
 * (também no 100 g e no %VD). Nutriente sem valor fica null e entra em `missing` (o rótulo não pode ser emitido).
 */
export function nutritionTable(per100: Partial<Record<LabelNutrient, number | null>>, portionG: number): NutritionTable {
  const missing: LabelNutrient[] = [];
  const rows = LABEL_ROWS.map(({ key, label, unit, indent }) => {
    const v = per100[key];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      missing.push(key);
      return { key, label, unit, indent: Boolean(indent), per100: null, perPortion: null, vdPct: null };
    }
    const portion = (v * portionG) / 100;
    const zero = portion <= NOT_SIGNIFICANT[key];
    const dv = DAILY_VALUES[key];
    return {
      key, label, unit, indent: Boolean(indent),
      per100: zero ? 0 : roundDeclared(key, v),
      perPortion: zero ? 0 : roundDeclared(key, portion),
      vdPct: dv === undefined ? null : zero ? 0 : Math.round((portion / dv) * 100),
    };
  });
  return { portionG, rows, missing };
}

/** Lupa frontal: "ALTO EM" quando o valor por 100 g/mL atinge o limite. */
export function frontWarnings(per100: Partial<Record<LabelNutrient, number | null>>, state: PhysicalState): FrontWarning[] {
  const l = FRONT_LIMITS[state];
  const out: FrontWarning[] = [];
  if ((per100.added_sugar_g ?? 0) >= l.added_sugar) out.push('added_sugar');
  if ((per100.saturated_fat_g ?? 0) >= l.saturated_fat) out.push('saturated_fat');
  if ((per100.sodium_mg ?? 0) >= l.sodium) out.push('sodium');
  return out;
}

const ALLERGEN_NAMES: Record<string, string> = {
  gluten: 'TRIGO (CEREAIS COM GLÚTEN)', crustaceans: 'CRUSTÁCEOS', eggs: 'OVOS', fish: 'PEIXES', peanut: 'AMENDOIM', soy: 'SOJA',
  milk: 'LEITE', almond: 'AMÊNDOA', hazelnut: 'AVELÃS', cashew: 'CASTANHA-DE-CAJU', brazil_nut: 'CASTANHA-DO-BRASIL', macadamia: 'MACADÂMIAS',
  walnut: 'NOZES', pecan: 'PECÃS', pistachio: 'PISTACHES', pine_nut: 'PINOLI', chestnut: 'CASTANHAS', latex: 'LÁTEX NATURAL',
};
const joinPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} E ${xs[xs.length - 1]}`);

/**
 * Declaração de alergênicos (RDC 26/2015), glúten (Lei 10.674/2003) e lactose (RDC 136/2017) a partir dos
 * códigos dos insumos. Leite aparece como "LEITE E DERIVADOS". O texto é sugestão: a RT confere.
 */
export function allergenStatement(codes: string[]): string {
  const set = new Set(codes);
  const names = [...set].filter((c) => c !== 'lactose' && ALLERGEN_NAMES[c]).sort((a, b) => ALLERGEN_NAMES[a]!.localeCompare(ALLERGEN_NAMES[b]!, 'pt-BR'))
    .map((c) => (c === 'milk' ? 'LEITE E DERIVADOS' : `${ALLERGEN_NAMES[c]}`));
  const parts: string[] = [];
  if (names.length) parts.push(`ALÉRGICOS: CONTÉM ${joinPt(names)}.`);
  parts.push(set.has('gluten') ? 'CONTÉM GLÚTEN.' : 'NÃO CONTÉM GLÚTEN.');
  if (set.has('lactose') || set.has('milk')) parts.push('CONTÉM LACTOSE.');
  return parts.join(' ');
}
