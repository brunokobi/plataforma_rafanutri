import { describe, expect, it } from 'vitest';
import { delta } from '@/lib/indicators/types';

describe('variação do indicador (RN-064)', () => {
  it('percentual contra o mês anterior', () => {
    expect(delta(120, 100)).toBe('+20%');
    expect(delta(95, 100)).toBe('−5%');
    expect(delta(100, 100)).toBe('0%');
    expect(delta(5, 0)).toBe('novo');
    expect(delta(0, 0)).toBeNull();
  });
});
