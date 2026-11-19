// U2a — Insumos, fornecedores e preços: tipos, rótulos e regras puras (as do banco ficam em 0042).
import { pricePerKgCents, type PurchaseUnit } from '@rafanutri/nutrition-core';

export type IngredientCategory = 'produce' | 'meat' | 'dairy' | 'grains' | 'bakery' | 'beverages' | 'frozen' | 'grocery' | 'cleaning' | 'disposables' | 'other';
export type Storage = 'ambient' | 'chilled' | 'frozen';
export type Allergen =
  | 'gluten' | 'crustaceans' | 'eggs' | 'fish' | 'peanut' | 'soy' | 'milk' | 'lactose' | 'almond' | 'hazelnut' | 'cashew'
  | 'brazil_nut' | 'macadamia' | 'walnut' | 'pecan' | 'pistachio' | 'pine_nut' | 'chestnut' | 'latex';

export const CATEGORY_LABEL: Record<IngredientCategory, string> = {
  produce: 'Hortifrúti', meat: 'Carnes e ovos', dairy: 'Laticínios', grains: 'Grãos e cereais', bakery: 'Panificação', beverages: 'Bebidas',
  frozen: 'Congelados', grocery: 'Mercearia', cleaning: 'Limpeza', disposables: 'Descartáveis', other: 'Outros',
};
export const UNIT_LABEL: Record<PurchaseUnit, string> = { kg: 'kg', g: 'g', l: 'L', ml: 'mL', un: 'unidade', dz: 'dúzia', cx: 'caixa', pct: 'pacote' };
export const STORAGE_LABEL: Record<Storage, string> = { ambient: 'Temperatura ambiente', chilled: 'Refrigerado', frozen: 'Congelado' };

/** Alergênicos da RDC 26/2015 (e lactose, RDC 135/2017), na ordem da norma. */
export const ALLERGEN_LABEL: Record<Allergen, string> = {
  gluten: 'Trigo, centeio, cevada, aveia (glúten)', crustaceans: 'Crustáceos', eggs: 'Ovos', fish: 'Peixes', peanut: 'Amendoim', soy: 'Soja',
  milk: 'Leite', lactose: 'Lactose', almond: 'Amêndoa', hazelnut: 'Avelã', cashew: 'Castanha-de-caju', brazil_nut: 'Castanha-do-pará',
  macadamia: 'Macadâmia', walnut: 'Nozes', pecan: 'Pecã', pistachio: 'Pistache', pine_nut: 'Pinoli', chestnut: 'Castanhas', latex: 'Látex natural',
};

export interface Ingredient {
  id: string;
  organization_id: string;
  name: string;
  category: IngredientCategory;
  food_id: number | null;
  food_name?: string | null;
  default_fc: number;
  purchase_unit: PurchaseUnit;
  density_g_ml: number | null;
  unit_weight_g: number | null;
  pack_grams: number | null;
  storage: Storage;
  min_stock: number | null;
  added_sugar_g_100g?: number | null;
  allergens: Allergen[];
  active: boolean;
  price_cents?: number | null;
  price_valid_from?: string | null;
}

export interface IngredientList { organization: { id: string; name: string }; can_manage: boolean; items: Ingredient[] }
export interface PriceRow { id: string; price_cents: number; valid_from: string; source: 'manual' | 'receiving' | 'import'; created_at: string; supplier_name: string | null; created_by_name: string | null }
export interface IngredientDetail {
  ingredient: Ingredient;
  food: { id: number; name: string; food_group: string | null } | null;
  can_manage: boolean;
  current_price: { id: string; price_cents: number; valid_from: string } | null;
  prices: PriceRow[];
  suppliers: Array<{ id: string; name: string }>;
}
export interface Supplier { id: string; organization_id: string; name: string; cnpj: string | null; contact_name: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean; ingredient_count?: number }
export interface SupplierList { organization: { id: string; name: string }; can_manage: boolean; items: Supplier[] }

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Preço por kg do insumo (null se a unidade não tiver peso definido). */
export function perKg(ing: Pick<Ingredient, 'purchase_unit' | 'density_g_ml' | 'unit_weight_g' | 'pack_grams'>, priceCents: number): number | null {
  try {
    return pricePerKgCents(priceCents, ing.purchase_unit, { densityGMl: ing.density_g_ml, unitWeightG: ing.unit_weight_g, packGrams: ing.pack_grams });
  } catch {
    return null;
  }
}

/** Variação entre o preço vigente e o anterior (%), para destacar alta ou queda. */
export function priceChange(prices: Array<Pick<PriceRow, 'price_cents' | 'valid_from' | 'created_at'>>, today: string): number | null {
  const valid = prices.filter((p) => p.valid_from <= today).sort((a, b) => b.valid_from.localeCompare(a.valid_from) || b.created_at.localeCompare(a.created_at));
  if (valid.length < 2) return null;
  return Math.round(((valid[0]!.price_cents - valid[1]!.price_cents) / valid[1]!.price_cents) * 1000) / 10;
}
