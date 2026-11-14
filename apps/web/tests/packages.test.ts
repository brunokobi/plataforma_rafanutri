import { describe, expect, it } from 'vitest';
import { packageBadge } from '@/lib/packages/types';

describe('aviso de pacote na agenda (RN-054)', () => {
  it('próxima sessão e última', () => {
    expect(packageBadge({ name: 'Trimestral', used: 1, total: 3 }, true)).toEqual({ text: 'Trimestral · sessão 2 de 3', last: false });
    expect(packageBadge({ name: 'Trimestral', used: 2, total: 3 }, true)).toEqual({ text: 'Trimestral · sessão 3 de 3', last: true });
    expect(packageBadge({ name: 'Trimestral', used: 3, total: 3 }, false)).toEqual({ text: 'Trimestral · 3 de 3 usadas', last: false });
  });
});
