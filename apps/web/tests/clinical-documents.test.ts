import { describe, expect, it } from 'vitest';
import { clinicalDocumentPdfData } from '@/lib/documents/pdf-data';
import { documentDefaults, documentFileName, type DocumentPayload } from '@/lib/documents/types';

const payload = (over: Partial<DocumentPayload['document']> = {}, header: Partial<DocumentPayload['header']> = {}): DocumentPayload => ({
  document: { id: 'd1', kind: 'exam_request', title: 'Pedido de exames', body: 'Em jejum de 8 horas.\n\nTrazer na próxima consulta.', exams: ['Hemograma completo', 'Ferritina'], document_date: '2026-11-14', status: 'published', published_at: '2026-11-14T13:00:00Z', ...over },
  header: { organization_id: 'o1', practice_name: 'Consultório Ana', brand_color: '#1565C0', professional_name: 'Ana Souza', crn: '12345', crn_region: 'CRN-3', contact: 'ana@example.com', patient_name: 'João Silva', objective: '', ...header },
});

describe('PDF do documento clínico (RN-215)', () => {
  it('pedido de exames: exames, parágrafos, data por extenso e marca', () => {
    const d = clinicalDocumentPdfData(payload());
    expect(d.kindLabel).toBe('Pedido de exames');
    expect(d.exams).toEqual(['Hemograma completo', 'Ferritina']);
    expect(d.paragraphs).toEqual(['Em jejum de 8 horas.', 'Trazer na próxima consulta.']);
    expect(d.dateLong).toBe('14 de novembro de 2026');
    expect(d.practice).toMatchObject({ practiceName: 'Consultório Ana', professionalName: 'Ana Souza', crn: '12345', crnRegion: 'CRN-3', color: '#1565C0' });
    expect(d.draft).toBe(false);
  });

  it('rascunho sai marcado; cor inválida volta ao padrão; exames só no pedido', () => {
    const d = clinicalDocumentPdfData(payload({ kind: 'general_guidance', status: 'draft', exams: ['X'] }, { brand_color: 'red', professional_name: null }));
    expect(d.draft).toBe(true);
    expect(d.practice.color).toBe('#2E7D32');
    expect(d.practice.professionalName).toBe('');
    expect(d.exams).toEqual([]);
  });

  it('textos sugeridos por tipo e nome do arquivo', () => {
    expect(documentDefaults('attendance_declaration', 'João Silva', '2026-11-14').body).toContain('João Silva esteve em consulta de nutrição no dia 14/11/2026');
    expect(documentDefaults('exam_request', '', '2026-11-14')).toEqual({ title: 'Pedido de exames', body: '' });
    expect(documentFileName({ title: 'Prescrição de suplementos!', document_date: '2026-11-14' })).toBe('prescricao-de-suplementos-2026-11-14.pdf');
    expect(documentFileName({ title: '***', document_date: '2026-11-14' })).toBe('documento-2026-11-14.pdf');
  });
});
