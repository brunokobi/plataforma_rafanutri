import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { HaccpPdf } from '@/components/pdf/uan-haccp';
import { answer, approvalIssues, cookingHazard, emptyHazard, haccpDecision, significant, visibleQuestions, type PlanDetail } from '@/lib/uan/haccp';

const q = (q1: boolean | null, q1b: boolean | null, q2: boolean | null, q3: boolean | null, q4: boolean | null) => ({ q1, q1b, q2, q3, q4 });

describe('APPCC (RN-160, RN-161)', () => {
  it('árvore decisória do Codex igual à do banco', () => {
    expect(haccpDecision(q(true, null, true, null, null))).toBe('ccp');
    expect(haccpDecision(q(true, null, false, false, null))).toBe('not_ccp');
    expect(haccpDecision(q(true, null, false, true, true))).toBe('not_ccp');
    expect(haccpDecision(q(true, null, false, true, false))).toBe('ccp');
    expect(haccpDecision(q(false, true, null, null, null))).toBe('modify');
    expect(haccpDecision(q(false, false, null, null, null))).toBe('not_ccp');
    expect(haccpDecision(q(true, null, false, null, null))).toBeNull();
  });
  it('perguntas visíveis e respostas que deixam de valer', () => {
    expect(visibleQuestions(q(null, null, null, null, null))).toEqual(['q1']);
    expect(visibleQuestions(q(true, null, false, true, null))).toEqual(['q1', 'q2', 'q3', 'q4']);
    const h = { ...emptyHazard(), q1: true, q2: false, q3: true, q4: false };
    const changed = answer(h, 'q2', true);
    expect([changed.q3, changed.q4]).toEqual([null, null]);
    expect(answer(h, 'q1', false).q2).toBeNull();
  });
  it('risco e pendências de aprovação', () => {
    expect(significant({ severity: 2, probability: 2 })).toBe(true);
    expect(significant({ severity: 3, probability: 1 })).toBe(false);
    const pcc = cookingHazard(74);
    expect(haccpDecision(pcc)).toBe('ccp');
    expect(pcc.critical_limit).toContain('74 °C');
    expect(approvalIssues([{ name: 'Cocção', description: null, target_temp: 74, hazards: [pcc] }])).toEqual([]);
    const noLimit = { ...pcc, critical_limit: null };
    expect(approvalIssues([{ name: 'Cocção', description: null, target_temp: 74, hazards: [noLimit, { ...emptyHazard(), description: 'X' }] }])).toHaveLength(2);
    expect(approvalIssues([])).toEqual(['O plano não tem etapas.']);
  });
  it('PDF do plano', async () => {
    const data: PlanDetail = {
      plan: { id: 'p', unit_id: 'u', root_id: 'p', version: 1, title: 'APPCC — Frango assado', scope: 'Almoço', sheet_root_id: null, status: 'approved', approved_at: '2026-11-18T12:00:00Z' },
      unit: { id: 'u', name: 'Cozinha' }, sheet: { id: 's', name: 'Frango assado' },
      steps: [{ name: 'Recebimento', description: null, target_temp: null, hazards: [] }, { name: 'Cocção', description: null, target_temp: 74, hazards: [{ ...cookingHazard(74), ccp_number: 1, critical_limit: 'Centro ≥ 74 °C' }] }],
      versions: [{ id: 'p', version: 1, status: 'approved', approved_at: '2026-11-18T12:00:00Z', approved_by_name: 'Ana' }],
      can_edit: false, can_approve: false, can_new_version: true, options: { templates: [], equipment: [] },
    };
    const b = await renderToBuffer(createElement(HaccpPdf, { data }) as Parameters<typeof renderToBuffer>[0]);
    expect(b.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
