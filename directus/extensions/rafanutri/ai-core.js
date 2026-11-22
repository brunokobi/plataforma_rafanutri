// Assistente de IA (0063): regras puras — escolha de modelos gratuitos, anonimização e montagem das mensagens.
// Só modelos gratuitos do OpenRouter (id terminando em ":free" e preço zero). Nesses modelos o provedor pode
// registrar o que recebe; por isso nada que identifique o paciente sai daqui (nome, CPF, contatos, datas exatas).
import { AI_DAILY_LIMIT } from './catalogs.js';

export const AI_KINDS = ['question', 'recipes', 'anamnesis_summary', 'plan_suggestion'];

/** Limite diário por consultório. Planos pagos: uso justo para proteger a cota dos modelos gratuitos. */
export { AI_DAILY_LIMIT };

/** Ordem de preferência; qualquer outro gratuito grande entra depois, se estes estiverem fora do ar. */
export const PREFERRED_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'baidu/ernie-5.5-flash-preview:free',
  'google/gemma-4-26b-a4b-it:free',
];

/** Modelos gratuitos da lista do OpenRouter, na ordem de tentativa. */
export function pickFreeModels(catalog, preferred = PREFERRED_MODELS) {
  const free = (catalog ?? []).filter((m) => typeof m?.id === 'string' && m.id.endsWith(':free')
    && String(m.pricing?.prompt) === '0' && String(m.pricing?.completion) === '0' && Number(m.context_length ?? 0) >= 32000
    && !/(^|[-/])(1\.7b|3b|1b|nano)([-:]|$)/i.test(m.id));
  const ids = new Set(free.map((m) => m.id));
  const first = preferred.filter((id) => ids.has(id));
  const rest = free.filter((m) => !first.includes(m.id)).sort((a, b) => Number(b.context_length) - Number(a.context_length)).map((m) => m.id);
  return [...first, ...rest];
}

const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g;
const DATE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;

/** Tira do texto o que identifica a pessoa: nomes informados, CPF, e-mail, telefone e datas. */
export function scrub(text, names = []) {
  let s = String(text ?? '');
  s = s.replace(CPF, '[CPF]').replace(EMAIL, '[e-mail]').replace(PHONE, '[telefone]').replace(DATE, '[data]');
  for (const n of names.flatMap((x) => String(x ?? '').split(/\s+/)).filter((w) => w.length >= 3)) {
    // Fronteira Unicode: \b não reconhece letras acentuadas (Ângela, Érica, Ítalo)
    s = s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu'), '[nome]');
  }
  return s;
}

/** Respostas de uma anamnese em "pergunta: resposta", anonimizadas e com tamanho limitado. */
export function formatAnswers(schema, answers, names = [], max = 6000) {
  const lines = [];
  for (const section of schema?.sections ?? []) {
    for (const q of section.questions ?? []) {
      const a = answers?.[q.id];
      if (a === undefined || a === null || a === '' || (Array.isArray(a) && a.length === 0)) continue;
      const label = (v) => q.options?.find((o) => o.value === v)?.label ?? v;
      const value = Array.isArray(a) ? a.map(label).join(', ') : typeof a === 'boolean' ? (a ? 'sim' : 'não') : label(a);
      lines.push(`- ${scrub(q.label, names)}: ${scrub(`${value}${q.unit ? ` ${q.unit}` : ''}`, names)}`);
    }
  }
  return lines.join('\n').slice(0, max);
}

/** Resumo clínico sem identificação: faixa de idade, sexo, objetivo, medidas e gestação. */
export function patientContext({ ageYears, sex, objective, weightKg, heightCm, pregnancyWeeks }, names = []) {
  const parts = [];
  if (ageYears != null) parts.push(ageYears < 2 ? `${Math.round(ageYears * 12)} meses` : `${Math.floor(ageYears)} anos`);
  if (sex) parts.push(sex === 'female' ? 'sexo feminino' : 'sexo masculino');
  if (weightKg) parts.push(`peso ${weightKg} kg`);
  if (heightCm) parts.push(`altura ${heightCm} cm`);
  if (weightKg && heightCm) parts.push(`IMC ${(weightKg / (heightCm / 100) ** 2).toFixed(1)}`);
  if (pregnancyWeeks != null) parts.push(`gestante, ${Math.floor(pregnancyWeeks)} semanas`);
  if (objective) parts.push(`objetivo: ${scrub(objective, names).slice(0, 300)}`);
  return parts.join('; ');
}

export const SYSTEM_PROMPT = [
  'Você é o assistente da Rafanutri e ajuda nutricionistas no Brasil. Responda sempre em português do Brasil, de forma objetiva, em Markdown simples (títulos curtos, listas).',
  'Use alimentos e medidas caseiras comuns no Brasil e as referências brasileiras (Guia Alimentar para a População Brasileira, TACO).',
  'A IA sugere e o nutricionista decide: não faça diagnóstico, não prescreva medicamentos nem doses de suplementos e aponte quando algo pedir avaliação médica.',
  'Se faltar informação, diga o que falta em vez de inventar. Não peça nem cite dados que identifiquem o paciente.',
].join(' ');

/** Mensagens para cada tipo de pedido. Devolve { messages } ou { error }. */
export function buildMessages(kind, input) {
  const text = scrub(String(input.text ?? '').trim(), input.names ?? []).slice(0, 2000);
  switch (kind) {
    case 'question':
      if (text.length < 5) return { error: 'Escreva a pergunta.' };
      return { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }] };
    case 'recipes':
      if (text.length < 3) return { error: 'Diga os ingredientes, a refeição ou a restrição.' };
      return { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `Sugira 3 receitas práticas e saudáveis para: ${text}.\nPara cada uma: nome, ingredientes com medidas caseiras, modo de preparo em poucos passos, rendimento e energia aproximada por porção. Evite ultraprocessados.` }] };
    case 'anamnesis_summary':
      if (!input.answers) return { error: 'O paciente ainda não tem anamnese respondida.' };
      return { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `Paciente: ${input.context || 'sem dados cadastrais'}.\n\nRespostas da anamnese:\n${input.answers}\n\nFaça um resumo clínico-nutricional em tópicos: queixas e objetivo, hábitos alimentares, sintomas e condições de saúde, pontos de atenção (riscos, alergias, interações), e 3 a 5 sugestões de condutas para o nutricionista avaliar.${text ? `\n\nObservação do nutricionista: ${text}` : ''}` }] };
    case 'plan_suggestion': {
      const kcal = Number(input.kcal);
      if (!(kcal >= 800 && kcal <= 5000)) return { error: 'Informe a meta de calorias (800 a 5.000 kcal).' };
      return { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `Paciente: ${input.context || 'adulto, sem dados cadastrais'}.${input.answers ? `\n\nPontos da anamnese:\n${input.answers}` : ''}\n\nMonte uma sugestão de cardápio de 1 dia com cerca de ${Math.round(kcal)} kcal, em 5 ou 6 refeições, com alimentos brasileiros e medidas caseiras (e gramas). Para cada refeição, dê 1 opção de substituição. No fim, a distribuição aproximada de proteínas, carboidratos e gorduras.${text ? `\n\nPreferências e restrições: ${text}` : ''}` }] };
    }
    default:
      return { error: 'Tipo de pedido inválido.' };
  }
}

/** Remove raciocínio exposto por alguns modelos ("<think>…</think>"). */
export const cleanAnswer = (s) => String(s ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
