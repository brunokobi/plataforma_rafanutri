// @rafanutri/forms — formato dos questionários (anamnese) e validação das respostas.
// JavaScript puro, sem dependências: o mesmo arquivo roda no app (Next.js), nos testes e na
// extensão do Directus (copiado por `pnpm --filter @rafanutri/forms sync`). Tipos em forms.d.ts.

export const QUESTION_TYPES = ['text', 'textarea', 'number', 'single', 'multiple', 'yesno', 'date', 'scale'];
export const FORMAT_VERSION = 1;

const ID = /^[a-z][a-z0-9_]{0,39}$/;
const LIMITS = { sections: 30, questions: 150, options: 40, label: 300, help: 500, text: 300, textarea: 4000 };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Todas as perguntas, na ordem. */
export function allQuestions(schema) {
  return (schema?.sections ?? []).flatMap((s) => s.questions ?? []);
}

/**
 * Valida o formato de um questionário. Devolve a lista de problemas (vazia = válido).
 * Regras: ids únicos e simples; opções nas perguntas de escolha; `show_if` só aponta para
 * pergunta anterior; limites de tamanho.
 */
export function validateQuestionnaire(schema) {
  const errors = [];
  if (!isObj(schema)) return ['O questionário precisa ser um objeto.'];
  if (schema.version !== FORMAT_VERSION) errors.push(`Versão do formato deve ser ${FORMAT_VERSION}.`);
  if (!Array.isArray(schema.sections) || schema.sections.length === 0) return [...errors, 'Inclua ao menos uma seção.'];
  if (schema.sections.length > LIMITS.sections) errors.push(`No máximo ${LIMITS.sections} seções.`);

  const seen = new Set();
  const before = new Map(); // id -> pergunta, só as anteriores
  let total = 0;
  schema.sections.forEach((section, si) => {
    const where = `Seção ${si + 1}`;
    if (!isObj(section)) return errors.push(`${where}: formato inválido.`);
    if (!str(section.title, 120)) errors.push(`${where}: informe o título.`);
    if (!Array.isArray(section.questions) || section.questions.length === 0) return errors.push(`${where}: inclua ao menos uma pergunta.`);
    section.questions.forEach((q, qi) => {
      total += 1;
      const at = `${where}, pergunta ${qi + 1}`;
      if (!isObj(q)) return errors.push(`${at}: formato inválido.`);
      if (typeof q.id !== 'string' || !ID.test(q.id)) errors.push(`${at}: id inválido (use letras minúsculas, números e _).`);
      else if (seen.has(q.id)) errors.push(`${at}: id "${q.id}" repetido.`);
      seen.add(q.id);
      if (!QUESTION_TYPES.includes(q.type)) errors.push(`${at}: tipo inválido.`);
      if (!str(q.label, LIMITS.label)) errors.push(`${at}: informe o enunciado.`);
      if (q.help != null && (typeof q.help !== 'string' || q.help.length > LIMITS.help)) errors.push(`${at}: ajuda muito longa.`);
      if (q.required != null && typeof q.required !== 'boolean') errors.push(`${at}: "obrigatória" deve ser verdadeiro ou falso.`);
      if (q.type === 'single' || q.type === 'multiple') {
        if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${at}: inclua ao menos duas opções.`);
        else {
          if (q.options.length > LIMITS.options) errors.push(`${at}: no máximo ${LIMITS.options} opções.`);
          const values = new Set();
          for (const o of q.options) {
            if (!isObj(o) || !str(o.value, 80) || !str(o.label, 200)) errors.push(`${at}: opção inválida.`);
            else if (values.has(o.value)) errors.push(`${at}: opção "${o.value}" repetida.`);
            else values.add(o.value);
          }
        }
      }
      if (q.type === 'number' || q.type === 'scale') {
        if (q.min != null && typeof q.min !== 'number') errors.push(`${at}: mínimo inválido.`);
        if (q.max != null && typeof q.max !== 'number') errors.push(`${at}: máximo inválido.`);
        if (typeof q.min === 'number' && typeof q.max === 'number' && q.min >= q.max) errors.push(`${at}: mínimo deve ser menor que o máximo.`);
        if (q.type === 'scale' && (typeof q.min !== 'number' || typeof q.max !== 'number' || q.max - q.min > 20)) errors.push(`${at}: escala precisa de mínimo e máximo (até 20 pontos).`);
      }
      if (q.show_if != null) {
        const c = q.show_if;
        const target = isObj(c) ? before.get(c.question) : undefined;
        if (!target) errors.push(`${at}: a condição precisa apontar para uma pergunta anterior.`);
        else if (!('equals' in c) && !('includes' in c)) errors.push(`${at}: condição sem "igual a" nem "contém".`);
        else if ('includes' in c && target.type !== 'multiple') errors.push(`${at}: "contém" só vale para múltipla escolha.`);
      }
      if (typeof q.id === 'string') before.set(q.id, q);
    });
  });
  if (total > LIMITS.questions) errors.push(`No máximo ${LIMITS.questions} perguntas.`);
  return errors;
}

/** A pergunta aparece? (condição `show_if` sobre a resposta de uma pergunta anterior). */
export function isVisible(question, answers) {
  const c = question.show_if;
  if (!c) return true;
  const value = answers?.[c.question];
  if ('includes' in c) return Array.isArray(value) && value.includes(c.includes);
  return value === c.equals;
}

const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function checkValue(q, v) {
  switch (q.type) {
    case 'text':
    case 'textarea': {
      if (typeof v !== 'string') return 'Resposta inválida.';
      const max = q.type === 'text' ? LIMITS.text : LIMITS.textarea;
      return v.length > max ? `Use no máximo ${max} caracteres.` : null;
    }
    case 'number':
    case 'scale': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'Informe um número.';
      if (q.type === 'scale' && !Number.isInteger(v)) return 'Escolha um ponto da escala.';
      if (typeof q.min === 'number' && v < q.min) return `O mínimo é ${q.min}.`;
      if (typeof q.max === 'number' && v > q.max) return `O máximo é ${q.max}.`;
      return null;
    }
    case 'single':
      return typeof v === 'string' && q.options.some((o) => o.value === v) ? null : 'Escolha uma das opções.';
    case 'multiple':
      return Array.isArray(v) && v.every((x) => q.options.some((o) => o.value === x)) && new Set(v).size === v.length
        ? null
        : 'Escolha entre as opções.';
    case 'yesno':
      return typeof v === 'boolean' ? null : 'Responda sim ou não.';
    case 'date':
      return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? null : 'Data inválida.';
    default:
      return 'Tipo de pergunta desconhecido.';
  }
}

/**
 * Valida e limpa as respostas.
 * - Ignora respostas de perguntas inexistentes ou ocultas pela condição (não são guardadas).
 * - `partial: true` (rascunho) não exige as obrigatórias.
 * Devolve { ok, errors: { [id]: mensagem }, answers: respostas limpas }.
 */
export function validateAnswers(schema, input, { partial = false } = {}) {
  const errors = {};
  const answers = {};
  const given = isObj(input) ? input : {};
  for (const q of allQuestions(schema)) {
    if (!isVisible(q, answers)) continue; // condição avaliada sobre respostas já limpas
    let v = given[q.id];
    if (typeof v === 'string') v = v.trim();
    if (empty(v)) {
      if (q.required && !partial) errors[q.id] = 'Resposta obrigatória.';
      continue;
    }
    const problem = checkValue(q, v);
    if (problem) errors[q.id] = problem;
    else answers[q.id] = v;
  }
  return { ok: Object.keys(errors).length === 0, errors, answers };
}

/** Texto legível de uma resposta (para a ficha e o PDF). */
export function formatAnswer(question, value) {
  if (empty(value)) return '—';
  const label = (v) => question.options?.find((o) => o.value === v)?.label ?? String(v);
  switch (question.type) {
    case 'single':
      return label(value);
    case 'multiple':
      return value.map(label).join(', ');
    case 'yesno':
      return value ? 'Sim' : 'Não';
    case 'date': {
      const [y, m, d] = String(value).split('-');
      return `${d}/${m}/${y}`;
    }
    case 'number':
      return `${String(value).replace('.', ',')}${question.unit ? ` ${question.unit}` : ''}`;
    default:
      return String(value);
  }
}
