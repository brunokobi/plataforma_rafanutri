// RN-047 — Feedback do programa beta (validação compartilhada entre o formulário e a action).
export type FeedbackKind = 'bug' | 'idea' | 'praise' | 'other';

export const FEEDBACK_KINDS: Array<{ value: FeedbackKind; label: string }> = [
  { value: 'bug', label: 'Algo deu errado' },
  { value: 'idea', label: 'Ideia ou sugestão' },
  { value: 'praise', label: 'Elogio' },
  { value: 'other', label: 'Outro' },
];

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  /** Caminho da página em que o feedback foi escrito. */
  page?: string;
}

/** Só o caminho, sem query string nem âncora (a URL pode ter ids ou filtros). */
export function feedbackPage(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const clean = path.split(/[?#]/)[0]!.slice(0, 200);
  return clean.startsWith('/') && !clean.startsWith('//') ? clean : undefined;
}

export function validateFeedback(input: FeedbackInput): string | null {
  if (!FEEDBACK_KINDS.some((k) => k.value === input.kind)) return 'Escolha o tipo.';
  const n = input.message.trim().length;
  if (n < 3) return 'Escreva pelo menos 3 caracteres.';
  if (n > 2000) return 'Use no máximo 2.000 caracteres.';
  return null;
}
