import { describe, expect, it } from 'vitest';
import { missingEvidence, ncOverdue, nextPending, numberValue, outsideRadius, rangeLabel, runProgress, type ChecklistAnswer } from '@/lib/uan/checklists';

const item = (position: number, patch: Partial<ChecklistAnswer> = {}): ChecklistAnswer => ({
  position, section: null, prompt: `Item ${position}`, help: null, kind: 'compliance', unit: null, min_value: null, max_value: null,
  critical: false, photo_on_fail: false, value: null, number_value: null, comment: null, has_photo: false, answered_at: null, ...patch,
});

describe('checklists de Boas Práticas (U1a)', () => {
  it('item numérico: dentro dos limites é conforme', () => {
    expect(numberValue(4, null, 5)).toBe('conform');
    expect(numberValue(5, null, 5)).toBe('conform');
    expect(numberValue(7, null, 5)).toBe('non_conform');
    expect(numberValue(-20, null, -18)).toBe('conform');
    expect(numberValue(-10, null, -18)).toBe('non_conform');
    expect(numberValue(55, 60, null)).toBe('non_conform');
    expect(numberValue(null, 0, 5)).toBeNull();
    expect(numberValue(Number.NaN, 0, 5)).toBeNull();
  });

  it('limites em texto', () => {
    expect(rangeLabel({ min_value: null, max_value: 5, unit: '°C' })).toBe('até 5 °C');
    expect(rangeLabel({ min_value: 60, max_value: null, unit: '°C' })).toBe('a partir de 60 °C');
    expect(rangeLabel({ min_value: 0, max_value: 4.5, unit: '°C' })).toBe('de 0 a 4,5 °C');
  });

  it('item crítico não conforme exige foto e comentário', () => {
    expect(missingEvidence(item(1, { value: 'non_conform', critical: true }))).toEqual({ photo: true, comment: true });
    expect(missingEvidence(item(1, { value: 'non_conform', critical: true, comment: 'x', has_photo: true }))).toBeNull();
    expect(missingEvidence(item(1, { value: 'non_conform', critical: true, comment: '  ', has_photo: true }))).toEqual({ photo: false, comment: true });
    expect(missingEvidence(item(1, { value: 'non_conform' }))).toBeNull();
    expect(missingEvidence(item(1, { value: 'conform', critical: true }))).toBeNull();
  });

  it('progresso e pontuação: conformes ÷ aplicáveis (mesma conta do banco)', () => {
    const answers = [
      ...Array.from({ length: 7 }, (_, i) => item(i + 1, { value: 'conform' })),
      item(8, { value: 'non_conform', critical: true, comment: 'Porta aberta', has_photo: true }),
      item(9, { value: 'na' }),
    ];
    const p = runProgress(answers);
    expect([p.answered, p.total, p.conform, p.nonConform, p.na, p.score]).toEqual([9, 9, 7, 1, 1, 87.5]);
    expect(p.blocking).toEqual([]);
    expect(runProgress([item(1, { value: 'na' })]).score).toBeNull();
  });

  it('pendências: sem resposta ou sem evidência; próximo pendente dá a volta', () => {
    const answers = [item(1, { value: 'conform' }), item(2), item(3, { value: 'non_conform', critical: true }), item(4, { value: 'conform' })];
    expect(runProgress(answers).blocking).toEqual([2, 3]);
    expect(nextPending(answers, 1)).toBe(2);
    expect(nextPending(answers, 3)).toBe(2);
    expect(nextPending([item(1, { value: 'conform' })], 1)).toBeNull();
  });

  it('não conformidade atrasada e localização fora do raio', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    expect(ncOverdue({ due_at: '2026-11-15T11:00:00Z', status: 'open' }, now)).toBe(true);
    expect(ncOverdue({ due_at: '2026-11-15T13:00:00Z', status: 'open' }, now)).toBe(false);
    expect(ncOverdue({ due_at: '2026-11-15T11:00:00Z', status: 'closed' }, now)).toBe(false);
    expect(outsideRadius(250, 200)).toBe(true);
    expect(outsideRadius(150, 200)).toBe(false);
    expect(outsideRadius(null, 200)).toBe(false);
  });
});

import { validateTemplateItems, weekdaysLabel, type TemplateItemInput } from '@/lib/uan/checklists';

describe('editor de modelos e agenda (RN-147, RN-150)', () => {
  const it0 = (p: Partial<TemplateItemInput> = {}): TemplateItemInput => ({ section: '', prompt: 'Piso limpo?', help: '', kind: 'compliance', unit: '', min_value: '', max_value: '', critical: false, ...p });

  it('dias da semana em texto', () => {
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe('seg a sex');
    expect(weekdaysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('todos os dias');
    expect(weekdaysLabel([5, 1, 3])).toBe('seg, qua e sex');
    expect(weekdaysLabel([7])).toBe('dom');
  });

  it('validação dos itens (igual à do servidor)', () => {
    expect(validateTemplateItems([it0()])).toBeNull();
    expect(validateTemplateItems([])).toMatch(/1 a 200/);
    expect(validateTemplateItems([it0(), it0({ prompt: 'ab' })])).toMatch(/^Item 2/);
    expect(validateTemplateItems([it0({ kind: 'number' })])).toMatch(/mínimo ou o máximo/);
    expect(validateTemplateItems([it0({ kind: 'number', max_value: '5' })])).toBeNull();
    expect(validateTemplateItems([it0({ kind: 'number', min_value: '10', max_value: '5' })])).toMatch(/passa do máximo/);
    expect(validateTemplateItems([it0({ kind: 'number', max_value: 'x' })])).toMatch(/inválidos/);
    expect(validateTemplateItems([it0({ kind: 'number', min_value: '-18,5' })])).toBeNull();
  });
});

import { indexLevel, pendingCount, rankUnits, type UnitCompliance } from '@/lib/uan/compliance';

describe('painel de conformidade (RN-165)', () => {
  const unit = (name: string, index: number | null, counts: Partial<UnitCompliance['counts']> = {}): UnitCompliance => ({
    id: name, name, kind: 'restaurant', days: 30, index, components: {}, weights: {},
    counts: { scheduled: 0, scheduled_done: 0, runs_completed: 0, readings: 0, readings_in_range: 0, nc_open: 0, nc_overdue: 0, nc_critical_open: 0, equipment_overdue: 0, checklists_overdue_today: 0, ...counts },
  });
  it('faixas do índice', () => {
    expect(indexLevel(92)).toBe('good');
    expect(indexLevel(85)).toBe('good');
    expect(indexLevel(84.9)).toBe('attention');
    expect(indexLevel(70)).toBe('attention');
    expect(indexLevel(69.9)).toBe('critical');
    expect(indexLevel(null)).toBeNull();
  });
  it('comparativo: pior primeiro, sem dados no fim', () => {
    expect(rankUnits([unit('B', 90), unit('C', null), unit('A', 60)]).map((u) => u.name)).toEqual(['A', 'B', 'C']);
  });
  it('pendências que pedem ação', () => {
    expect(pendingCount(unit('A', 50, { nc_overdue: 2, equipment_overdue: 1, checklists_overdue_today: 1, nc_open: 5 }))).toBe(4);
  });
});
