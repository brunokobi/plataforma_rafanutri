import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DossierPdf, ManualPdf } from '@/components/pdf/uan-legal';
import { annexLetters, defaultPeriod, licenseName, licenseStatus, manualIncludes, manualSections, type CurrentDoc, type DossierData, type ManualData } from '@/lib/uan/legal';

const doc = (code: string, title: string, i: number): CurrentDoc => ({
  id: `d${i}`, kind: 'pop', code, title, version_id: `v${i}`, version: 2, approved_at: '2026-11-10T12:00:00Z', next_review_on: '2027-11-10',
  content_hash: 'a'.repeat(64), approved_by_name: 'Ana RT', body_md: `# ${title}\n\n## Objetivo\n\nTexto com **negrito**.\n\n- item`,
});
const manual = (docs: CurrentDoc[]): ManualData => ({
  organization: 'Cozinhas Boa Mesa', technical_lead: 'Ana RT', team_size: 6, last_training_on: '2026-10-01',
  unit: { id: 'u1', name: 'Cozinha Central', kind: 'restaurant', cnpj: '12345678000190', address: 'Rua A, 10', city: 'Vitória', state: 'ES', sanitary_license: null, sanitary_license_expires_at: null },
  equipment: [{ name: 'Geladeira 1', kind: 'refrigerator', min_temp: 0, max_temp: 5 }],
  licenses: [{ id: 'l1', kind: 'sanitary_permit', title: null, number: 'AL-1', issued_on: '2026-01-01', valid_until: '2027-01-01', provider: 'Vigilância', notes: null, archived: false, created_at: '' }],
  documents: docs, editions: [], can_issue: true, can_audit: true,
});

describe('licenças', () => {
  it('situação pela validade', () => {
    expect(licenseStatus(null, '2026-11-18')).toBe('no_date');
    expect(licenseStatus('2026-11-17', '2026-11-18')).toBe('expired');
    expect(licenseStatus('2026-12-18', '2026-11-18')).toBe('expiring');
    expect(licenseStatus('2026-12-19', '2026-11-18')).toBe('valid');
    expect(licenseName({ kind: 'other', title: 'PPCI' })).toBe('PPCI');
    expect(licenseName({ kind: 'pest_control', title: null })).toBe('Controle de pragas (certificado)');
  });
  it('período padrão do dossiê: 30 dias', () => {
    expect(defaultPeriod('2026-11-18')).toEqual({ from: '2026-10-20', to: '2026-11-18' });
  });
});

describe('Manual de Boas Práticas (RN-157)', () => {
  it('13 seções da RDC 216 com dados da unidade e POPs como anexos', () => {
    const docs = [doc('pop-higienizacao', 'POP 1 — Higienização', 1), doc('pop-agua', 'POP 2 — Água', 2)];
    const sec = manualSections(manual(docs), '2026-11-18');
    expect(sec).toHaveLength(13);
    expect(sec[0]!.body).toContain('- **Unidade:** Cozinha Central');
    expect(sec[0]!.body).toContain('12.345.678/0001-90');
    expect(sec[0]!.body).toContain('Alvará sanitário nº AL-1, válido até 01/01/2027');
    expect(sec[1]!.body).toContain('- Geladeira 1 (geladeira, 0 a 5 °C)');
    expect(sec[2]!.body).toContain('**anexo A**');
    expect(sec[4]!.body).toContain('**anexo B**');
    expect(sec[3]!.body).toContain('**Pendente:**'); // POP 3 não aprovado
    expect(sec[11]!.body).toContain('Anexo B: POP 2 — Água — versão 2');
    expect(annexLetters(docs).get('d2')).toBe('B');
    expect(manualIncludes(manual(docs)).documents).toEqual([{ id: 'd1', version_id: 'v1', version: 2, hash: 'a'.repeat(64) }, { id: 'd2', version_id: 'v2', version: 2, hash: 'a'.repeat(64) }]);
  });

  it('PDF do Manual e do dossiê são gerados', async () => {
    const docs = [doc('pop-higienizacao', 'POP 1 — Higienização', 1)];
    const m = await renderToBuffer(createElement(ManualPdf, { data: manual(docs), edition: 1, today: '2026-11-18', signer: 'Ana RT' }) as Parameters<typeof renderToBuffer>[0]);
    expect(m.subarray(0, 4).toString()).toBe('%PDF');
    const d: DossierData = {
      period: { from: '2026-10-20', to: '2026-11-18' }, generated_at: '2026-11-18T12:00:00Z', organization: 'Cozinhas', unit: manual(docs).unit, technical_lead: 'Ana RT',
      licenses: manual(docs).licenses, documents: docs, manual: { edition: 1, created_at: '2026-11-18T12:00:00Z', signed_name: 'Ana RT', file_hash: null },
      trainings: [{ id: 't', topic: 'BPF', held_on: '2026-11-01', hours: 2, instructor: null, attendees: ['João'] }],
      checklists: [{ id: 'c', template_name: 'Abertura', completed_at: '2026-11-10T11:00:00Z', score: 90, conform: 9, non_conform: 1, na: 0, completed_by: 'João', content_hash: 'b'.repeat(64), failures: [{ prompt: 'Lixeira com tampa', critical: true, comment: 'quebrada', value: null, unit: null }] }],
      temperatures: [{ recorded_at: '2026-11-10T10:00:00Z', target: 'Geladeira 1', value: 7, min: 0, max: 5, out_of_range: true, corrective_action: 'Ajustado', by: 'João' }],
      non_conformities: [{ id: 'n', source: 'checklist', title: 'Lixeira', severity: 'critical', status: 'closed', opened_at: '2026-11-10T11:00:00Z', due_at: '2026-11-11T11:00:00Z', closed_at: '2026-11-11T09:00:00Z', closing_note: 'Trocada', plans: 1 }],
      integrity: { total: 2, divergent: 0, rows: [] }, truncated: false,
    };
    const b = await renderToBuffer(createElement(DossierPdf, { data: d, today: '2026-11-18' }) as Parameters<typeof renderToBuffer>[0]);
    expect(b.subarray(0, 4).toString()).toBe('%PDF');
    expect(b.length).toBeGreaterThan(5000);
  }, 30_000);
});
