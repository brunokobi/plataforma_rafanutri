// U7 — Cardápio publicado para o comensal e pesquisa de satisfação (RN-223).
import type { Allergen } from '@/lib/uan/catalog';
import type { MenuService, MenuSlot } from '@/lib/uan/menus';

export interface PublicDish {
  service: MenuService;
  slot: MenuSlot;
  sheet_root_id: string;
  name: string;
  allergens: Allergen[];
  nutrients: { energy_kcal: number | null; protein_g: number | null; carbohydrate_g: number | null; lipid_g: number | null; fiber_g: number | null; sodium_mg: number | null };
}
export interface SurveyQuestion { text: string; kind: 'stars' | 'yes_no' }
export interface PublicSurvey { id: string; title: string; questions: SurveyQuestion[]; per_dish: boolean }
export interface PublicMenu {
  unit: { name: string; organization: string; brand_color: string | null };
  today: string;
  days: Array<{ date: string; items: PublicDish[] }>;
  survey: PublicSurvey | null;
}
export interface PublicMenuSettings {
  unit: { id: string; name: string; active: boolean };
  enabled: boolean;
  token: string | null;
  survey: (PublicSurvey & { created_at: string }) | null;
  results: Array<{ sheet_root_id: string | null; name: string; responses: number; avg_rating: number | null; comments: number }>;
  comments: Array<{ served_on: string; rating: number | null; comment: string; dish: string | null }>;
}

export const DEFAULT_QUESTIONS: SurveyQuestion[] = [
  { text: 'Que nota você dá para este prato?', kind: 'stars' },
  { text: 'Você comeria de novo?', kind: 'yes_no' },
];

/** Pratos agrupados por serviço (desjejum, almoço…), na ordem do dia. */
export function groupByService(items: PublicDish[]): Array<{ service: MenuService; items: PublicDish[] }> {
  const out: Array<{ service: MenuService; items: PublicDish[] }> = [];
  for (const it of items) {
    const g = out.find((x) => x.service === it.service);
    if (g) g.items.push(it); else out.push({ service: it.service, items: [it] });
  }
  return out;
}

/** "terça-feira, 18 de novembro". */
export const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Respostas válidas para as perguntas (estrela 1–5 ou sim/não), na ordem. */
export function answersComplete(questions: SurveyQuestion[], answers: Array<number | boolean | null>): boolean {
  return questions.length === answers.length && questions.every((q, i) => (q.kind === 'stars' ? typeof answers[i] === 'number' && answers[i]! >= 1 && answers[i]! <= 5 : typeof answers[i] === 'boolean'));
}
