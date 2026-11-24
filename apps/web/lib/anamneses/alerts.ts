import { allQuestions, formatAnswer, isVisible } from '@rafanutri/forms';
import type { Anamnesis } from './repository';

export interface HealthAlerts {
  items: Array<{ label: string; text: string }>;
  source: { title: string; answeredAt: string | null; reviewed: boolean };
}

/** Perguntas sobre alergias, intolerâncias e restrições (pelo id ou pelo enunciado, sem acento). */
const ALERT = /alerg|intoler|restri/;
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
/** Respostas que não indicam nada a destacar. */
const NOTHING = /^(nao|nenhum|nenhuma|nada|sem|n\/a|-|—)\.?$/;

/**
 * Alergias e restrições da anamnese respondida mais recente (revisada ou não), para destacar na
 * ficha e no editor de plano. Ignora perguntas ocultas pela condição e respostas como "não"/"nenhuma".
 */
export function extractHealthAlerts(anamneses: Anamnesis[] | null | undefined): HealthAlerts | null {
  const latest = (anamneses ?? [])
    .filter((a) => a.status === 'answered' || a.status === 'reviewed')
    .sort((a, b) => (b.answered_at ?? '').localeCompare(a.answered_at ?? ''))[0];
  if (!latest) return null;
  const items: HealthAlerts['items'] = [];
  for (const q of allQuestions(latest.schema_snapshot)) {
    if (!ALERT.test(norm(`${q.id} ${q.label}`)) || !isVisible(q, latest.answers)) continue;
    const value = latest.answers[q.id];
    if (value === undefined || value === false || (Array.isArray(value) && value.length === 0)) continue;
    const text = formatAnswer(q, value);
    if (NOTHING.test(norm(text.trim()))) continue;
    items.push({ label: q.label, text });
  }
  if (items.length === 0) return null;
  return { items, source: { title: latest.title ?? 'Anamnese', answeredAt: latest.answered_at, reviewed: latest.status === 'reviewed' } };
}

/**
 * Texto das respostas da anamnese mais recente para as sugestões de plano: respostas abertas e listas
 * marcadas entram como estão; pergunta de sim/não só entra (pelo enunciado) quando a resposta é "sim".
 * Respostas "não"/"nenhuma" ficam de fora, para não sugerir pelo que o paciente negou.
 */
export function anamnesisSignalText(anamneses: Anamnesis[] | null | undefined): string {
  const latest = (anamneses ?? [])
    .filter((a) => a.status === 'answered' || a.status === 'reviewed')
    .sort((a, b) => (b.answered_at ?? '').localeCompare(a.answered_at ?? ''))[0];
  if (!latest) return '';
  const parts: string[] = [];
  for (const q of allQuestions(latest.schema_snapshot)) {
    if (!isVisible(q, latest.answers)) continue;
    const value = latest.answers[q.id];
    if (value === undefined || value === null || value === false || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    if (value === true) { parts.push(q.label); continue; }
    const text = formatAnswer(q, value).trim();
    if (!text || NOTHING.test(norm(text))) continue;
    if (/^sim\.?$/.test(norm(text))) parts.push(q.label);
    else parts.push(text);
  }
  return parts.join(' | ').slice(0, 8000);
}
