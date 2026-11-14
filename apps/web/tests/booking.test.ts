import { describe, expect, it } from 'vitest';
import { dayLabel, whenLabel } from '@/lib/booking/types';

describe('agendamento online (RN-068)', () => {
  it('rótulos em pt-BR no horário de Brasília', () => {
    expect(dayLabel('2026-11-18')).toBe('quarta-feira, 18 de nov.');
    expect(whenLabel('2026-11-18T12:00:00.000Z')).toBe('18/11/2026 às 09:00');
  });
});
