// Catálogos do materno-infantil (RN-114, RN-116, RN-118). Os códigos são iguais aos da extensão (maternal.js).
import type { ConsentMethod, FeedingRecord, FeedingType, Reaction, Relationship } from './types';

/** Alergênicos mais comuns na introdução alimentar, com a idade de referência para oferecer (meses). */
export const ALLERGENS: Array<{ code: string; label: string; fromMonths: number; tip: string }> = [
  { code: 'egg', label: 'Ovo', fromMonths: 6, tip: 'Ovo inteiro bem cozido (clara e gema), desde o início da introdução alimentar.' },
  { code: 'peanut', label: 'Amendoim', fromMonths: 6, tip: 'Em pasta diluída ou farinha misturada à comida; nunca o grão inteiro (risco de engasgo).' },
  { code: 'wheat', label: 'Trigo', fromMonths: 6, tip: 'Macarrão, pão ou farinha nas preparações.' },
  { code: 'fish', label: 'Peixe', fromMonths: 6, tip: 'Bem cozido, desfiado e sem espinhas.' },
  { code: 'soy', label: 'Soja', fromMonths: 6, tip: 'Grão cozido ou tofu nas refeições.' },
  { code: 'sesame', label: 'Gergelim', fromMonths: 6, tip: 'Tahine ou semente moída misturada à comida.' },
  { code: 'tree_nuts', label: 'Castanhas', fromMonths: 6, tip: 'Moídas ou em pasta; nunca inteiras antes dos 4 anos.' },
  { code: 'shellfish', label: 'Frutos do mar', fromMonths: 6, tip: 'Bem cozidos e picados, se fizerem parte da alimentação da família.' },
  { code: 'cow_milk', label: 'Leite de vaca', fromMonths: 12, tip: 'Como bebida, só depois de 1 ano; antes disso, em pequena quantidade nas preparações, se orientado.' },
];

/** Etapas de textura, com a idade de referência (Guia Alimentar para Crianças Menores de 2 Anos). */
export const TEXTURES: Array<{ code: string; label: string; fromMonths: number; tip: string }> = [
  { code: 'mashed', label: 'Amassada com garfo', fromMonths: 6, tip: 'Comida amassada, sem liquidificar nem peneirar.' },
  { code: 'soft_pieces', label: 'Pedaços pequenos e macios', fromMonths: 7, tip: 'Mais grossa, com pedaços para treinar a mastigação.' },
  { code: 'chopped', label: 'Picada ou desfiada', fromMonths: 9, tip: 'Perto da comida da família; a criança pega com a mão.' },
  { code: 'family', label: 'Comida da família', fromMonths: 12, tip: 'Mesma comida da família, com pouco sal e sem temperos prontos.' },
];

export const REACTION_LABEL: Record<Reaction, string> = { none: 'Sem reação', mild: 'Reação leve', moderate: 'Reação moderada', severe: 'Reação grave' };
export const FEEDING_TYPE_LABEL: Record<FeedingType, string> = {
  exclusive: 'Aleitamento materno exclusivo',
  predominant: 'Aleitamento predominante (leite materno e água, chás ou sucos)',
  complemented: 'Aleitamento complementado (leite materno e comida)',
  mixed: 'Aleitamento misto (leite materno e outro leite)',
};
export const RELATIONSHIP_LABEL: Record<Relationship, string> = { mother: 'Mãe', father: 'Pai', grandparent: 'Avó ou avô', legal_guardian: 'Tutor legal', other: 'Outro' };
export const CONSENT_LABEL: Record<ConsentMethod, string> = { in_person: 'Presencial, na consulta', signed_form: 'Termo assinado', other: 'Outra forma' };

/** Reação que merece destaque (e aviso ao nutricionista quando o responsável registra). */
export const isSeriousReaction = (r: Reaction) => r === 'moderate' || r === 'severe';

export interface ChecklistItem {
  code: string;
  label: string;
  tip: string;
  fromMonths: number;
  record: FeedingRecord | null;
  /** Já passou da idade de referência e ainda não foi oferecido. */
  due: boolean;
}

/** Monta o checklist da criança: cada item com o registro (se houver) e se já está na hora de oferecer. */
export function feedingChecklist(kind: 'allergen' | 'texture', records: FeedingRecord[], ageMonths: number): ChecklistItem[] {
  const list = kind === 'allergen' ? ALLERGENS : TEXTURES;
  return list.map((i) => {
    const record = records.find((r) => r.kind === kind && r.item === i.code) ?? null;
    return { ...i, record, due: !record && ageMonths >= i.fromMonths };
  });
}

/** Meses completos entre duas datas ISO (pós-parto, idade). */
export function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T12:00:00Z`);
  const b = new Date(`${toIso}T12:00:00Z`);
  return (b.getTime() - a.getTime()) / (30.4375 * 864e5);
}
