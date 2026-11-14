import { KIND_LABEL, type DocumentPayload } from './types';

export interface ClinicalDocumentPdfData {
  practice: { practiceName: string; professionalName: string; crn: string; crnRegion: string; color: string; contact: string };
  kindLabel: string;
  title: string;
  patientName: string;
  /** "14 de novembro de 2026" */
  dateLong: string;
  /** Parágrafos do texto livre. */
  paragraphs: string[];
  exams: string[];
  draft: boolean;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Dados do PDF do documento clínico (função pura, testável). */
export function clinicalDocumentPdfData(p: DocumentPayload): ClinicalDocumentPdfData {
  const h = p.header;
  const d = p.document;
  const [y, m, day] = d.document_date.split('-').map(Number);
  const dateLong = y && m && day
    ? new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : d.document_date;
  return {
    practice: {
      practiceName: h.practice_name || 'Consultório',
      professionalName: h.professional_name ?? '',
      crn: h.crn ?? '',
      crnRegion: h.crn_region || 'CRN',
      color: h.brand_color && HEX.test(h.brand_color) ? h.brand_color : '#2E7D32',
      contact: h.contact ?? '',
    },
    kindLabel: KIND_LABEL[d.kind] ?? 'Documento',
    title: d.title,
    patientName: h.patient_name,
    dateLong,
    paragraphs: d.body.replace(/\r\n/g, '\n').split(/\n{2,}/).map((t) => t.trim()).filter(Boolean),
    exams: d.kind === 'exam_request' ? d.exams : [],
    draft: d.status !== 'published',
  };
}
