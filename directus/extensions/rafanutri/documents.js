// RN-215 — Regras puras dos documentos clínicos (validação antes do banco, que repete as regras).

export const DOCUMENT_KINDS = ['exam_request', 'supplement_prescription', 'attendance_declaration', 'general_guidance'];

/**
 * Valida um documento (ou modelo). Devolve { value } ou { errors }.
 * `withDate`: documentos têm data (aaaa-mm-dd); modelos não.
 */
export function validateDocumentInput(b, { withDate = true } = {}) {
  const errors = {};
  const kind = DOCUMENT_KINDS.includes(b?.kind) ? b.kind : null;
  if (!kind) errors.kind = 'Escolha o tipo de documento.';
  const title = typeof b?.title === 'string' ? b.title.trim().replace(/\s+/g, ' ') : '';
  if (title.length < 2 || title.length > 120) errors.title = 'Título de 2 a 120 caracteres.';
  const body = typeof b?.body === 'string' ? b.body.replace(/\r\n/g, '\n').trim() : '';
  if (body.length > 6000) errors.body = 'Texto de até 6.000 caracteres.';
  let exams = [];
  if (kind === 'exam_request') {
    const raw = Array.isArray(b?.exams) ? b.exams : [];
    const seen = new Set();
    for (const e of raw) {
      const name = typeof e === 'string' ? e.trim().replace(/\s+/g, ' ') : '';
      if (!name) continue;
      if (name.length < 2 || name.length > 120) { errors.exams = 'Cada exame com 2 a 120 caracteres.'; break; }
      const key = name.toLocaleLowerCase('pt-BR');
      if (!seen.has(key)) { seen.add(key); exams.push(name); }
    }
    if (exams.length > 60) errors.exams = 'Até 60 exames por pedido.';
    if (!errors.exams && !errors.body && exams.length === 0 && body.length < 2) errors.exams = 'Marque ao menos um exame ou escreva o pedido.';
  } else if (kind && !errors.body && body.length < 2) {
    errors.body = 'Escreva o texto do documento.';
  }
  let document_date;
  if (withDate) {
    const d = typeof b?.document_date === 'string' ? b.document_date : '';
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
    if (!ok) errors.document_date = 'Data inválida.';
    else document_date = d;
  }
  if (Object.keys(errors).length) return { errors };
  return { value: { kind, title, body, exams, ...(withDate ? { document_date } : {}) } };
}
