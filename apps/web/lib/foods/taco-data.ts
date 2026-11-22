// Funções puras da consulta às tabelas públicas (TACO e IBGE/POF): grupos, ficha e formatação dos valores.

/** Tabelas públicas de composição consultáveis em /app/alimentos/taco. */
export const PUBLIC_SOURCES = { TACO: 'TACO 4ª ed.', IBGE: 'IBGE (POF 2008-2009)', OFF: 'Rótulos (Open Food Facts)', USDA: 'USDA (EUA)' } as const;
export type PublicSource = keyof typeof PUBLIC_SOURCES;
export const isPublicSource = (v: unknown): v is PublicSource => typeof v === 'string' && v in PUBLIC_SOURCES;

/** Rótulo curto da fonte (listas e ficha). */
export const SOURCE_SHORT: Record<string, string> = { TACO: 'TACO', IBGE: 'IBGE', OFF: 'Rótulo', USDA: 'USDA', CUSTOM: 'Próprio' };

/** Grupos da TACO 4ª edição (fixos na fonte; a base do IBGE foi classificada nos mesmos grupos). */
export const TACO_GROUPS = [
  'Cereais e derivados',
  'Verduras, hortaliças e derivados',
  'Frutas e derivados',
  'Gorduras e óleos',
  'Pescados e frutos do mar',
  'Carnes e derivados',
  'Leite e derivados',
  'Bebidas (alcoólicas e não alcoólicas)',
  'Ovos e derivados',
  'Produtos açucarados',
  'Miscelâneas',
  'Outros alimentos industrializados',
  'Alimentos preparados',
  'Leguminosas e derivados',
  'Nozes e sementes',
] as const;

export interface TacoNutrient {
  code: string;
  name: string;
  unit: string;
  /** null = não analisado (NA). */
  amount: number | null;
  trace: boolean;
}

export interface TacoFoodDetail {
  id: string;
  code: string | null;
  name: string;
  group: string;
  householdMeasures: Array<{ label: string; grams: number }>;
  nutrients: TacoNutrient[];
  source: { code: string; name: string; version: string | null; citation: string | null };
}

export interface DirectusTacoDetail {
  id: number;
  name: string;
  food_group: string | null;
  source_code: string | null;
  household_measures: Array<{ label: string; grams: number }> | null;
  source_id: { code?: string; name: string; version: string | null; citation: string | null } | null;
  nutrients: Array<{ amount_per_100g: string | number | null; is_trace: boolean; nutrient_id: { code: string; name: string; unit: string; position: number } | null }>;
}

export function toDetail(item: DirectusTacoDetail): TacoFoodDetail {
  const nutrients = (item.nutrients ?? [])
    .filter((n) => n.nutrient_id)
    .sort((a, b) => a.nutrient_id!.position - b.nutrient_id!.position)
    .map((n) => ({
      code: n.nutrient_id!.code,
      name: n.nutrient_id!.name,
      unit: n.nutrient_id!.unit,
      amount: n.amount_per_100g === null || n.amount_per_100g === undefined ? null : Number(n.amount_per_100g),
      trace: n.is_trace === true,
    }));
  return {
    id: String(item.id),
    code: item.source_code,
    name: item.name,
    group: item.food_group ?? 'Outros',
    householdMeasures: (item.household_measures ?? []).filter((m) => m && typeof m.label === 'string' && m.label.trim() !== '' && Number(m.grams) > 0).map((m) => ({ label: m.label.trim(), grams: Number(m.grams) })),
    nutrients,
    source: { code: item.source_id?.code ?? 'TACO', name: item.source_id?.name ?? 'TACO', version: item.source_id?.version ?? null, citation: item.source_id?.citation ?? null },
  };
}

/** Valor para exibir: "Tr" (traço), "NA" (não analisado) ou número com casas conforme a grandeza. */
export function formatNutrient(n: Pick<TacoNutrient, 'amount' | 'trace'>, factor = 1): string {
  if (n.trace) return 'Tr';
  if (n.amount === null) return 'NA';
  const v = n.amount * factor;
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
