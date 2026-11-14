export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Fácil', medium: 'Média', hard: 'Difícil' };

/** Receita como aparece nas listas (GET /rafanutri/recipes). */
export interface RecipeSummary {
  id: string;
  name: string;
  archived: boolean;
  description: string | null;
  prep_minutes: number | null;
  difficulty: Difficulty | null;
  tags: string[];
  has_image: boolean;
  yield_g: number;
  servings: number | null;
  kcal_per_serving: number | null;
  kcal_per_100g: number | null;
}

/** Receita que o paciente vê: enviada pelo nutricionista e/ou usada no plano publicado. */
export interface VisibleRecipe {
  id: string;
  name: string;
  description: string | null;
  prep_minutes: number | null;
  difficulty: Difficulty | null;
  tags: string[];
  has_image: boolean;
  yield_g: number;
  servings: number | null;
  sent: boolean;
  in_plan: boolean;
  note: string | null;
  sent_at: string | null;
}

export interface PatientRecipeDetail extends VisibleRecipe {
  patient_id: string;
  instructions: string | null;
  ingredients: Array<{ name: string | null; quantityG: number; household_measures: Array<{ label: string; grams: number }> }>;
}

/** Recebida na ficha do paciente (visão do nutricionista). */
export type PatientRecipeRow = RecipeSummary & Pick<VisibleRecipe, 'sent' | 'in_plan' | 'note' | 'sent_at'>;
