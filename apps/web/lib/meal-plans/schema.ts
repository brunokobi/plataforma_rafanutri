import { z } from 'zod';

export interface PlanItem {
  key: string;
  foodId: string;
  quantityG: number;
  subs?: Array<{ foodId: string; quantityG: number }>;
}
export interface PlanMeal {
  id: string;
  name: string;
  time: string;
  items: PlanItem[];
}

export type FormulaKey = 'mifflin' | 'harris' | 'fao';
export interface PlanTargets {
  formula: FormulaKey;
  activity: number;
  adjustment: number;
  proteinPerKg: number;
  lipidPct: number;
  /** Usada quando não dá para calcular o gasto energético (falta sexo, idade, peso ou altura). */
  manualKcal: number;
}

export type PlanMode = 'quantitative' | 'qualitative';
export type PlanStatus = 'draft' | 'published' | 'archived';

export interface MealPlanSummary {
  id: string;
  title: string;
  status: PlanStatus;
  mode: PlanMode;
  published_at: string | null;
  valid_until: string | null;
  date_created: string;
  date_updated: string | null;
  totals: { energy_kcal?: number } | null;
}
export interface MealPlanRow extends MealPlanSummary {
  patient_id: string;
  targets: Partial<PlanTargets>;
  meals: PlanMeal[];
  guidelines: string | null;
}

export const DEFAULT_TARGETS: PlanTargets = { formula: 'mifflin', activity: 1.55, adjustment: 0, proteinPerKg: 1.6, lipidPct: 28, manualKcal: 1800 };

export const DEFAULT_MEALS: PlanMeal[] = [
  { id: 'cafe', name: 'Café da manhã', time: '07:30', items: [] },
  { id: 'lanche-manha', name: 'Lanche da manhã', time: '10:00', items: [] },
  { id: 'almoco', name: 'Almoço', time: '12:30', items: [] },
  { id: 'lanche-tarde', name: 'Lanche da tarde', time: '16:00', items: [] },
  { id: 'jantar', name: 'Jantar', time: '19:30', items: [] },
];

const portion = z.object({ foodId: z.string().regex(/^\d+$/), quantityG: z.number().min(0).max(5000) });

export const planContentSchema = z.object({
  title: z.string().trim().min(1, 'Dê um título ao plano.').max(120),
  mode: z.enum(['quantitative', 'qualitative']),
  targets: z.object({
    formula: z.enum(['mifflin', 'harris', 'fao']),
    activity: z.number().min(1).max(2.5),
    adjustment: z.number().min(-2000).max(2000),
    proteinPerKg: z.number().min(0.3).max(4),
    lipidPct: z.number().min(5).max(70),
    manualKcal: z.number().min(600).max(6000),
  }),
  meals: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().trim().min(1).max(60),
        time: z.string().regex(/^\d{2}:\d{2}$/),
        items: z.array(portion.extend({ key: z.string().min(1).max(80), subs: z.array(portion).max(10).optional() })).max(40),
      }),
    )
    .max(10),
  guidelines: z.string().max(4000).nullable(),
});

export type PlanContent = z.infer<typeof planContentSchema>;

/** Todos os ids de alimentos usados no plano (itens e substituições). */
export function planFoodIds(meals: PlanMeal[]): string[] {
  const ids = new Set<string>();
  for (const m of meals) for (const i of m.items) {
    ids.add(i.foodId);
    for (const s of i.subs ?? []) ids.add(s.foodId);
  }
  return [...ids];
}

export const STATUS_LABEL: Record<PlanStatus, string> = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' };
