// Catálogos do materno-infantil (RN-114, RN-116, RN-118). Os códigos são iguais aos da extensão (maternal.js).
import {
  ALLERGENS as CAT_ALLERGENS, CONSENT_LABEL as CAT_CONSENT_LABEL, FEEDING_TYPE_LABEL as CAT_FEEDING_TYPE_LABEL, REACTION_LABEL as CAT_REACTION_LABEL,
  RELATIONSHIP_LABEL as CAT_RELATIONSHIP_LABEL, SERIOUS_REACTIONS, TEXTURES as CAT_TEXTURES,
} from '@rafanutri/catalogs';
import type { FeedingRecord, Reaction } from './types';

export const ALLERGENS = CAT_ALLERGENS;

export const TEXTURES = CAT_TEXTURES;

export const REACTION_LABEL = CAT_REACTION_LABEL;
export const FEEDING_TYPE_LABEL = CAT_FEEDING_TYPE_LABEL;
export const RELATIONSHIP_LABEL = CAT_RELATIONSHIP_LABEL;
export const CONSENT_LABEL = CAT_CONSENT_LABEL;

/** Reação que merece destaque (e aviso ao nutricionista quando o responsável registra). */
export const isSeriousReaction = (r: Reaction) => SERIOUS_REACTIONS.includes(r);

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
