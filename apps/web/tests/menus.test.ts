import { describe, expect, it } from 'vitest';
import { cycleDate, dayIndexOn, optionsForSlot, repetitions } from '@/lib/uan/menus';

describe('cardápio cíclico (U2c)', () => {
  it('ciclo de 28 dias iniciado em 01/03: 30/03 é o dia 2 (igual ao banco)', () => {
    expect(dayIndexOn('2026-03-01', 28, '2026-03-30')).toBe(2);
    expect(dayIndexOn('2026-03-01', 28, '2026-03-01')).toBe(1);
    expect(dayIndexOn('2026-03-01', 28, '2026-03-28')).toBe(28);
    expect(dayIndexOn('2026-03-01', 28, '2026-02-28')).toBeNull();
  });

  it('data e rótulo do dia do ciclo', () => {
    expect(cycleDate('2026-11-16', 1)).toEqual({ iso: '2026-11-16', label: 'seg 16/11' });
    expect(cycleDate('2026-11-16', 7).label).toBe('dom 22/11');
  });

  it('repetição da mesma preparação no mesmo serviço em menos de 7 dias (circular)', () => {
    const items = [
      { day_index: 1, service: 'lunch' as const, slot: 'main' as const, sheet_root_id: 'frango' },
      { day_index: 4, service: 'lunch' as const, slot: 'main' as const, sheet_root_id: 'frango' },
      { day_index: 1, service: 'dinner' as const, slot: 'main' as const, sheet_root_id: 'frango' },
      { day_index: 2, service: 'lunch' as const, slot: 'main' as const, sheet_root_id: 'peixe' },
      { day_index: 13, service: 'lunch' as const, slot: 'main' as const, sheet_root_id: 'peixe' },
    ];
    const r = repetitions(items, 14);
    expect(r.get('4:lunch:main')).toBe(3);
    expect(r.has('1:lunch:main')).toBe(false); // anterior foi o dia 4 do ciclo passado: 11 dias
    expect(r.has('1:dinner:main')).toBe(false); // outro serviço
    expect(r.get('2:lunch:main')).toBe(3); // dia 13 → dia 2 do ciclo seguinte (3 dias)
    expect(r.has('13:lunch:main')).toBe(false);
  });

  it('opções da posição: mesma categoria primeiro', () => {
    const o = optionsForSlot([{ root_id: 'a', name: 'Arroz', category: 'side', cost_cents: 1 }, { root_id: 'b', name: 'Frango', category: 'main', cost_cents: 2 }], 'main');
    expect(o.match.map((x) => x.name)).toEqual(['Frango']);
    expect(o.others.map((x) => x.name)).toEqual(['Arroz']);
  });
});
