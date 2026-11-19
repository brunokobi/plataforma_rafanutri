import { describe, expect, it } from 'vitest';
import { equipmentList, parseMarkdown, pendingAcks, POP_TEMPLATES, renderTemplate, trainingOverdue } from '@/lib/uan/documents';

describe('documentos de BPF (U6a)', () => {
  it('os 4 POPs da RDC 216 com as variáveis da unidade', () => {
    expect(POP_TEMPLATES.map((t) => t.code)).toEqual(['pop-higienizacao', 'pop-agua', 'pop-pragas', 'pop-manipuladores']);
    const pop1 = renderTemplate(POP_TEMPLATES[0]!.body, { unidade: 'Cozinha Central', endereco: 'Rua A, Vitória', rt: 'Ana', data: '18/11/2026', equipamentos: equipmentList([{ name: 'Geladeira 1', kind: 'refrigerator' }, { name: 'Freezer', kind: 'freezer' }]) });
    expect(pop1).toContain('**Unidade:** Cozinha Central');
    expect(pop1).toContain('- Geladeira 1 (geladeira)');
    expect(pop1).toContain('- Freezer (freezer)');
    expect(pop1).not.toContain('{{equipamentos}}');
    expect(renderTemplate('{{unidade}} e {{x}}', { unidade: 'U' })).toBe('U e {{x}}');
    expect(equipmentList([])).toContain('cadastre os equipamentos');
  });

  it('Markdown simples sem HTML', () => {
    const b = parseMarkdown('# Título\n\nTexto com **negrito**\ncontinua\n\n- a\n- b\n\n1. passo\n> aviso\n<script>x</script>');
    expect(b.map((x) => x.kind)).toEqual(['h1', 'p', 'ul', 'ol', 'quote', 'p']);
    expect(b[1]).toEqual({ kind: 'p', inline: [{ text: 'Texto com ', bold: false }, { text: 'negrito', bold: true }, { text: ' continua', bold: false }] });
    expect(b[5]).toEqual({ kind: 'p', inline: [{ text: '<script>x</script>', bold: false }] }); // vira texto, não HTML
  });

  it('reciclagem pendente: sem treinamento há 12 meses', () => {
    expect(trainingOverdue(null, '2026-11-18')).toBe(true);
    expect(trainingOverdue('2025-11-17', '2026-11-18')).toBe(true);
    expect(trainingOverdue('2025-11-19', '2026-11-18')).toBe(false);
  });

  it('ciência pendente: versão vigente não lida', () => {
    const base = { kind: 'pop' as const, code: null, title: 'POP', review_every_months: 12, approved_at: null, next_review_on: null, has_draft: false, review_overdue: false, ack_count: 0 };
    expect(pendingAcks([{ ...base, id: 'a', version_id: 'v', version: 3, acknowledged: false }, { ...base, id: 'b', version_id: 'w', version: 1, acknowledged: true }, { ...base, id: 'c', version_id: null, version: null, acknowledged: false }]).map((d) => d.id)).toEqual(['a']);
  });
});
