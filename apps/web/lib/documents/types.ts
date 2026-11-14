export type DocumentKind = 'exam_request' | 'supplement_prescription' | 'attendance_declaration' | 'general_guidance';
export type DocumentStatus = 'draft' | 'published';

export const DOCUMENT_KINDS: DocumentKind[] = ['exam_request', 'supplement_prescription', 'attendance_declaration', 'general_guidance'];

export const KIND_LABEL: Record<DocumentKind, string> = {
  exam_request: 'Pedido de exames',
  supplement_prescription: 'Prescrição de suplementos',
  attendance_declaration: 'Declaração de comparecimento',
  general_guidance: 'Orientações gerais',
};

/** Exames laboratoriais mais pedidos em consulta de nutrição (selecionáveis no pedido). */
export const COMMON_EXAMS = [
  'Hemograma completo',
  'Glicemia de jejum',
  'Hemoglobina glicada (HbA1c)',
  'Insulina de jejum',
  'Colesterol total e frações',
  'Triglicerídeos',
  'TGO (AST) e TGP (ALT)',
  'Gama-GT',
  'Ureia',
  'Creatinina',
  'Ácido úrico',
  'TSH',
  'T4 livre',
  'Ferritina',
  'Ferro sérico',
  'Vitamina D (25-OH)',
  'Vitamina B12',
  'Ácido fólico',
  'Zinco',
  'Magnésio',
  'PCR ultrassensível',
  'Sódio e potássio',
  'Cálcio',
  'Albumina',
  'Urina tipo 1 (EAS)',
  'Parasitológico de fezes',
] as const;

export interface ClinicalDocument {
  id: string;
  kind: DocumentKind;
  title: string;
  body: string;
  exams: string[];
  document_date: string; // aaaa-mm-dd
  status: DocumentStatus;
  published_at: string | null;
  date_created: string;
  date_updated: string | null;
}

export interface DocumentTemplate {
  id: string;
  kind: DocumentKind;
  title: string;
  body: string;
  exams: string[];
}

export interface DocumentInput {
  kind: DocumentKind;
  title: string;
  body: string;
  exams: string[];
  document_date: string;
}

/** Cabeçalho do PDF, como o servidor devolve. */
export interface DocumentHeader {
  organization_id: string;
  practice_name: string;
  brand_color: string | null;
  professional_name: string | null;
  crn: string;
  crn_region: string;
  contact: string;
  patient_name: string;
  objective: string;
}

export interface DocumentPayload {
  document: Pick<ClinicalDocument, 'id' | 'kind' | 'title' | 'body' | 'exams' | 'document_date' | 'status' | 'published_at'>;
  header: DocumentHeader;
}

/** Como o paciente vê na lista. */
export type PatientDocument = Pick<ClinicalDocument, 'id' | 'kind' | 'title' | 'document_date' | 'published_at'>;

export type DocumentResult = { ok: true } | { ok: false; message: string; fields?: Record<string, string> };

/** Título e texto sugeridos ao escolher o tipo (o profissional edita à vontade). */
export function documentDefaults(kind: DocumentKind, patientName: string, dateISO: string): { title: string; body: string } {
  const [y, m, d] = dateISO.split('-');
  const date = y && m && d ? `${d}/${m}/${y}` : dateISO;
  switch (kind) {
    case 'exam_request':
      return { title: 'Pedido de exames', body: '' };
    case 'supplement_prescription':
      return { title: 'Prescrição de suplementos', body: '1. Nome do suplemento — dose\n   Tomar ... vezes ao dia, ...\n' };
    case 'attendance_declaration':
      return {
        title: 'Declaração de comparecimento',
        body: `Declaro, para os devidos fins, que ${patientName || '[nome do paciente]'} esteve em consulta de nutrição no dia ${date}, das __:__ às __:__.`,
      };
    case 'general_guidance':
      return { title: 'Orientações gerais', body: '' };
  }
}

/** "pedido-de-exames-2026-11-14.pdf" */
export function documentFileName(doc: Pick<ClinicalDocument, 'title' | 'document_date'>): string {
  const slug = doc.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'documento';
  return `${slug}-${doc.document_date}.pdf`;
}
