import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatAnswer, isVisible, validateAnswers, validateQuestionnaire, type Questionnaire } from '../src/forms.js';

const here = dirname(fileURLToPath(import.meta.url));

const schema: Questionnaire = {
  version: 1,
  sections: [
    {
      title: 'Saúde',
      questions: [
        { id: 'usa_med', type: 'yesno', label: 'Usa medicamentos?', required: true },
        { id: 'meds', type: 'textarea', label: 'Quais?', required: true, show_if: { question: 'usa_med', equals: true } },
        { id: 'objetivos', type: 'multiple', label: 'Objetivos', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
        { id: 'peso_cat', type: 'number', label: 'Peso', min: 30, max: 200, unit: 'kg', show_if: { question: 'objetivos', includes: 'b' } },
        { id: 'sono', type: 'scale', label: 'Sono', min: 1, max: 5 },
        { id: 'nasc', type: 'date', label: 'Data' },
        { id: 'tipo', type: 'single', label: 'Tipo', options: [{ value: 'x', label: 'Xis' }, { value: 'y', label: 'Ípsilon' }] },
      ],
    },
  ],
};

describe('validateQuestionnaire', () => {
  it('aceita um questionário válido', () => expect(validateQuestionnaire(schema)).toEqual([]));

  it.each([
    ['sem seções', { version: 1, sections: [] }, /ao menos uma seção/],
    ['id repetido', { version: 1, sections: [{ title: 'S', questions: [{ id: 'a', type: 'text', label: 'A' }, { id: 'a', type: 'text', label: 'B' }] }] }, /repetido/],
    ['id com espaço', { version: 1, sections: [{ title: 'S', questions: [{ id: 'a b', type: 'text', label: 'A' }] }] }, /id inválido/],
    ['escolha com 1 opção', { version: 1, sections: [{ title: 'S', questions: [{ id: 'a', type: 'single', label: 'A', options: [{ value: 'x', label: 'X' }] }] }] }, /duas opções/],
    ['condição para pergunta posterior', { version: 1, sections: [{ title: 'S', questions: [{ id: 'a', type: 'text', label: 'A', show_if: { question: 'b', equals: 'x' } }, { id: 'b', type: 'text', label: 'B' }] }] }, /pergunta anterior/],
    ['"contém" em pergunta que não é múltipla', { version: 1, sections: [{ title: 'S', questions: [{ id: 'a', type: 'text', label: 'A' }, { id: 'b', type: 'text', label: 'B', show_if: { question: 'a', includes: 'x' } }] }] }, /múltipla escolha/],
    ['escala sem limites', { version: 1, sections: [{ title: 'S', questions: [{ id: 'a', type: 'scale', label: 'A' }] }] }, /escala/],
    ['tipo desconhecido', { version: 1, sections: [{ title: 'S', questions: [{ id: 'a', type: 'cor', label: 'A' }] }] }, /tipo inválido/],
  ])('recusa: %s', (_, bad, message) => {
    expect(validateQuestionnaire(bad).join(' ')).toMatch(message);
  });
});

describe('isVisible e validateAnswers', () => {
  it('pergunta condicional oculta não é obrigatória nem guardada', () => {
    const r = validateAnswers(schema, { usa_med: false, meds: 'resto de rascunho' });
    expect(r.ok).toBe(true);
    expect(r.answers).toEqual({ usa_med: false });
  });
  it('pergunta condicional visível passa a ser obrigatória', () => {
    const r = validateAnswers(schema, { usa_med: true });
    expect(r.ok).toBe(false);
    expect(r.errors.meds).toBe('Resposta obrigatória.');
  });
  it('"contém" na múltipla escolha', () => {
    expect(isVisible(schema.sections[0]!.questions[3]!, { objetivos: ['a', 'b'] })).toBe(true);
    expect(isVisible(schema.sections[0]!.questions[3]!, { objetivos: ['a'] })).toBe(false);
  });
  it('rascunho (partial) não exige obrigatórias, mas valida o que veio', () => {
    expect(validateAnswers(schema, {}, { partial: true }).ok).toBe(true);
    expect(validateAnswers(schema, { sono: 9 }, { partial: true }).errors.sono).toBe('O máximo é 5.');
  });
  it.each([
    [{ usa_med: 'sim' }, 'usa_med'],
    [{ usa_med: false, tipo: 'z' }, 'tipo'],
    [{ usa_med: false, objetivos: ['a', 'a'] }, 'objetivos'],
    [{ usa_med: false, objetivos: ['b'], peso_cat: 10 }, 'peso_cat'],
    [{ usa_med: false, nasc: '2026-13-40' }, 'nasc'],
    [{ usa_med: false, sono: 2.5 }, 'sono'],
  ])('recusa valor inválido %j', (input, field) => {
    expect(validateAnswers(schema, input).errors[field]).toBeTruthy();
  });
  it('descarta respostas de perguntas que não existem e apara texto', () => {
    const r = validateAnswers(schema, { usa_med: true, meds: '  Metformina  ', hack: 'x' });
    expect(r.answers).toEqual({ usa_med: true, meds: 'Metformina' });
  });
});

describe('formatAnswer', () => {
  const q = schema.sections[0]!.questions;
  it('formata cada tipo', () => {
    expect(formatAnswer(q[0]!, true)).toBe('Sim');
    expect(formatAnswer(q[2]!, ['a', 'b'])).toBe('A, B');
    expect(formatAnswer(q[3]!, 62.5)).toBe('62,5 kg');
    expect(formatAnswer(q[5]!, '1994-03-12')).toBe('12/03/1994');
    expect(formatAnswer(q[6]!, 'y')).toBe('Ípsilon');
    expect(formatAnswer(q[1]!, undefined)).toBe('—');
  });
});

describe('modelos padrão (db/seed/questionnaires)', () => {
  const dir = resolve(here, '../../../db/seed/questionnaires');
  const files = readdirSync(dir).filter((f: string) => f.endsWith('.json'));
  it('existem modelos', () => expect(files.length).toBeGreaterThanOrEqual(3));
  it.each(files)('%s passa no validador', (file) => {
    const t = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.name.length).toBeGreaterThan(3);
    expect(validateQuestionnaire(t.schema)).toEqual([]);
  });
});

describe('cópia na extensão do Directus', () => {
  it('directus/extensions/rafanutri/forms.js é igual a src/forms.js (rode `pnpm --filter @rafanutri/forms sync`)', () => {
    const src = readFileSync(resolve(here, '../src/forms.js'), 'utf8');
    const copy = readFileSync(resolve(here, '../../../directus/extensions/rafanutri/forms.js'), 'utf8');
    expect(copy).toBe(src);
  });
});
