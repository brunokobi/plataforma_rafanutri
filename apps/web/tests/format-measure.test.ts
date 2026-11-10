import { describe, expect, it } from 'vitest';
import { formatMeasure, pluralizeMeasure } from '@/lib/format/measure';

describe('plural das medidas caseiras', () => {
  it.each([
    ['colher de sopa', 'colheres de sopa'],
    ['colher de chá', 'colheres de chá'],
    ['unidade média', 'unidades médias'],
    ['fatia', 'fatias'],
    ['concha média', 'conchas médias'],
    ['filé médio', 'filés médios'],
    ['copo americano', 'copos americanos'],
    ['pegador', 'pegadores'],
    ['escumadeira', 'escumadeiras'],
    ['colher de sopa ralada', 'colheres de sopa ralada'],
  ])('%s → %s', (singular, plural) => expect(pluralizeMeasure(singular)).toBe(plural));

  it('singular até 1,9 e plural a partir de 2', () => {
    expect(formatMeasure(1, 'fatia')).toBe('1 fatia');
    expect(formatMeasure(1.5, 'fatia')).toBe('1,5 fatia');
    expect(formatMeasure(2, 'fatia')).toBe('2 fatias');
    expect(formatMeasure(10, 'unidade')).toBe('10 unidades');
  });
});
