import { describe, expect, it } from 'vitest';
import { abcCurve, deviationPct, perCapitaCents, topDeviations } from './costs';

describe('custos da UAN (RN-229)', () => {
  it('planejado R$ 12,00 e realizado R$ 13,10: +9,2%', () => {
    expect(deviationPct(1200, 1310)).toBe(9.2);
    expect(deviationPct(1200, 1100)).toBe(-8.3);
    expect(deviationPct(0, 100)).toBeNull();
    expect(perCapitaCents(393000, 300)).toBe(1310);
    expect(perCapitaCents(100, 0)).toBeNull();
  });

  it('os produtos que mais explicam o desvio', () => {
    const planned = new Map([['carne', { name: 'Carne', cents: 100000 }], ['arroz', { name: 'Arroz', cents: 20000 }], ['oleo', { name: 'Óleo', cents: 5000 }]]);
    const actual = new Map([['carne', { name: 'Carne', cents: 125000 }], ['arroz', { name: 'Arroz', cents: 19000 }], ['tomate', { name: 'Tomate', cents: 8000 }]]);
    const top = topDeviations(planned, actual, 3);
    expect(top.map((t) => [t.name, t.diffCents])).toEqual([['Carne', 25000], ['Tomate', 8000], ['Óleo', -5000]]);
  });

  it('curva ABC', () => {
    const abc = abcCurve([
      { key: 'a', name: 'Carne', valueCents: 7000 },
      { key: 'b', name: 'Frango', valueCents: 1500 },
      { key: 'c', name: 'Arroz', valueCents: 800 },
      { key: 'd', name: 'Sal', valueCents: 400 },
      { key: 'e', name: 'Orégano', valueCents: 300 },
      { key: 'f', name: 'Zero', valueCents: 0 },
    ]);
    expect(abc.map((l) => [l.name, l.abc, l.cumulativePct])).toEqual([['Carne', 'A', 70], ['Frango', 'A', 85], ['Arroz', 'B', 93], ['Sal', 'B', 97], ['Orégano', 'C', 100]]);
    expect(abc[0]!.sharePct).toBe(70);
    expect(abcCurve([])).toEqual([]);
  });
});
