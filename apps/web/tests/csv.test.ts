import { describe, expect, it } from 'vitest';
import { csvRows, toCsv } from '@/lib/uan/csv';
import type { DossierData } from '@/lib/uan/legal';

describe('CSV dos registros (RN-166)', () => {
  it('separador ponto e vírgula, BOM, vírgula decimal, aspas e proteção contra fórmula', () => {
    const csv = toCsv([['a', 'b;c', 'diz "oi"', 3.5, '=SOMA(A1)', '-2,5', null]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿a;"b;c";"diz ""oi""";3,5;\'=SOMA(A1);-2,5;\r\n');
  });
  it('temperaturas do período', () => {
    const data = { temperatures: [{ recorded_at: '2026-11-18T13:00:00Z', target: 'Geladeira 1', value: 7, min: 0, max: 5, out_of_range: true, corrective_action: 'Ajustado', by: 'Ana' }] } as unknown as DossierData;
    const rows = csvRows('temperaturas', data);
    expect(rows[0]![0]).toBe('Data e hora');
    expect(rows[1]).toEqual(['18/11/2026, 10:00:00', 'Geladeira 1', 7, 0, 5, 'sim', 'Ajustado', 'Ana']);
  });
});
