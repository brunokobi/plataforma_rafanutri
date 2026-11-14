import { describe, expect, it } from 'vitest';
import { daysUntil, dueLabel, metricsTotals, returnReminderLink } from '@/lib/crm/types';

describe('CRM (RN-056)', () => {
  it('retorno: atrasado, hoje, em breve', () => {
    expect(daysUntil('2026-11-10', '2026-11-14')).toBe(-4);
    expect(dueLabel('2026-11-13', '2026-11-14')).toBe('Atrasado há 1 dia');
    expect(dueLabel('2026-11-14', '2026-11-14')).toBe('Hoje');
    expect(dueLabel('2026-11-19', '2026-11-14')).toBe('Em 5 dias');
  });
  it('lembrete pelo WhatsApp', () => {
    const url = returnReminderLink('+55 31 99999-0000', 'Maria', 'Consultório Ana');
    expect(url.startsWith('https://wa.me/5531999990000?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1]!)).toContain('Olá, Maria! Aqui é do Consultório Ana.');
  });
  it('conversão lead → 1ª consulta', () => {
    expect(metricsTotals([
      { source: 'instagram', leads: 6, converted: 3, lost: 2, first_visit: 2 },
      { source: 'referral', leads: 4, converted: 2, lost: 0, first_visit: 2 },
    ])).toEqual({ leads: 10, converted: 5, lost: 2, first_visit: 4, rate: 40 });
    expect(metricsTotals([]).rate).toBe(0);
  });
});
