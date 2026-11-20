import { describe, expect, it } from 'vitest';
import { LEGAL_VERSIONS, pendingDocuments, REQUIRED, versionLabel } from '@/lib/legal/info';

describe('aceite dos documentos legais', () => {
  it('pede o que falta na versão vigente de cada perfil', () => {
    expect(pendingDocuments(REQUIRED.professional, [])).toEqual(['professional_terms', 'privacy']);
    const ok = [{ document: 'professional_terms', version: LEGAL_VERSIONS.professional_terms }, { document: 'privacy', version: LEGAL_VERSIONS.privacy }];
    expect(pendingDocuments(REQUIRED.professional, ok)).toEqual([]);
    expect(pendingDocuments(REQUIRED.patient, ok)).toEqual(['patient_terms']);
    expect(pendingDocuments(REQUIRED.professional, [{ document: 'professional_terms', version: '2020-01-01' }, ok[1]!])).toEqual(['professional_terms']);
  });
  it('data da versão por extenso', () => {
    expect(versionLabel('2026-11-20')).toBe('20 de novembro de 2026');
  });
});
