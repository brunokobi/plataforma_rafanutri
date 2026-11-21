import { describe, expect, it } from 'vitest';
import { navModel } from '@/components/app/app-nav';
import { hoursLabel, KIND_LABEL, REMINDER_HOURS } from '@/lib/notifications/types';

describe('avisos', () => {
  it('rótulos dos horários de lembrete', () => {
    expect(hoursLabel(24)).toBe('1 dia antes');
    expect(hoursLabel(72)).toBe('3 dias antes');
    expect(hoursLabel(1)).toBe('1 hora antes');
    expect(hoursLabel(6)).toBe('6 horas antes');
    expect(REMINDER_HOURS).toEqual([72, 48, 24, 12, 6, 3, 2, 1]);
  });
  it('sem WhatsApp entre os tipos', () => {
    expect(Object.keys(KIND_LABEL)).not.toContain('whatsapp');
  });
  it('menu do consultório leva aos avisos', () => {
    const conta = navModel('/app/clinico').more.find((g) => g.title === 'Conta');
    expect(conta?.links.map((l) => l.href)).toContain('/app/configuracoes/avisos');
  });
});
