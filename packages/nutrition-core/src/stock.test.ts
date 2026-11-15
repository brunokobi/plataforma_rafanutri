import { describe, expect, it } from 'vitest';
import { pickLotsFefo } from './stock';

describe('FEFO (RN-143)', () => {
  const lots = [
    { id: 'a', quantityG: 5000, expiresOn: '2026-05-10', receivedAt: '2026-05-01' },
    { id: 'b', quantityG: 3000, expiresOn: '2026-05-05', receivedAt: '2026-05-02' },
    { id: 'c', quantityG: 1000, expiresOn: null, receivedAt: '2026-04-01' },
  ];
  it('leite de 05/05 sai antes do de 10/05; sem validade por último', () => {
    expect(pickLotsFefo(lots, 2000)).toEqual([{ id: 'b', takeG: 2000 }]);
    expect(pickLotsFefo(lots, 8500)).toEqual([{ id: 'b', takeG: 3000 }, { id: 'a', takeG: 5000 }, { id: 'c', takeG: 500 }]);
  });
  it('saldo insuficiente', () => {
    expect(() => pickLotsFefo(lots, 9001)).toThrow(/Saldo insuficiente/);
    expect(() => pickLotsFefo(lots, 0)).toThrow();
  });
});
