import { describe, expect, it } from 'vitest';
import { currentPrice, grossFromNet, pricePerKgCents, toGrams } from './units';

describe('unidades de compra (RN-125)', () => {
  it('1 L de leite com densidade 1,03 = 1030 g', () => {
    expect(toGrams(1, 'l', { densityGMl: 1.03 })).toBeCloseTo(1030);
  });
  it('massa, volume sem densidade, unidade, dúzia e embalagem', () => {
    expect(toGrams(2.5, 'kg')).toBe(2500);
    expect(toGrams(500, 'ml')).toBe(500);
    expect(toGrams(3, 'un', { unitWeightG: 50 })).toBe(150);
    expect(toGrams(1, 'dz', { unitWeightG: 55 })).toBe(660);
    expect(toGrams(2, 'cx', { packGrams: 12000 })).toBe(24000);
    expect(() => toGrams(1, 'un')).toThrow(/peso da unidade/);
    expect(() => toGrams(-1, 'kg')).toThrow();
  });
  it('preço por kg', () => {
    expect(pricePerKgCents(899, 'kg')).toBe(899);
    expect(pricePerKgCents(2490, 'cx', { packGrams: 5000 })).toBe(498);
    expect(pricePerKgCents(120, 'un', { unitWeightG: 60 })).toBe(2000);
    expect(pricePerKgCents(650, 'l', { densityGMl: 1.03 })).toBe(631);
  });
  it('preço vigente na data', () => {
    const prices = [
      { valid_from: '2026-10-01', price_cents: 500, created_at: '1' },
      { valid_from: '2026-11-01', price_cents: 550, created_at: '2' },
      { valid_from: '2026-11-01', price_cents: 560, created_at: '3' },
      { valid_from: '2026-12-01', price_cents: 600, created_at: '4' },
    ];
    expect(currentPrice(prices, '2026-11-15')?.price_cents).toBe(560);
    expect(currentPrice(prices, '2026-10-15')?.price_cents).toBe(500);
    expect(currentPrice(prices, '2026-09-30')).toBeNull();
  });
  it('peso bruto pelo FC', () => {
    expect(grossFromNet(1000, 1.25)).toBe(1250);
    expect(() => grossFromNet(1000, 0.9)).toThrow();
  });
});
