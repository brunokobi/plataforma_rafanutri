// Documentos legais: versões vigentes e dados do responsável.
// Mudar o texto de um documento = nova versão (data). Quem aceitou a anterior aceita de novo ao entrar.

export type LegalDocument = 'professional_terms' | 'patient_terms' | 'privacy';

/** Versões vigentes (iguais às da extensão: LEGAL_VERSIONS em directus/extensions/rafanutri/index.js). */
export const LEGAL_VERSIONS: Record<LegalDocument, string> = {
  professional_terms: '2026-11-20',
  patient_terms: '2026-11-20',
  privacy: '2026-11-21',
};

export const LEGAL_TITLE: Record<LegalDocument, string> = {
  professional_terms: 'Termos de Uso para Profissionais',
  patient_terms: 'Termos de Uso para Pacientes',
  privacy: 'Política de Privacidade',
};

export const LEGAL_PATH: Record<LegalDocument, string> = {
  professional_terms: '/termos',
  patient_terms: '/termos/paciente',
  privacy: '/privacidade',
};

/** Documentos que cada perfil precisa aceitar. */
export const REQUIRED: Record<'professional' | 'patient', LegalDocument[]> = {
  professional: ['professional_terms', 'privacy'],
  patient: ['patient_terms', 'privacy'],
};

/**
 * Dados do responsável pela plataforma. Preencha antes do lançamento comercial: enquanto estiverem vazios,
 * os textos apontam para o canal de atendimento dentro da plataforma.
 */
export const LEGAL_ENTITY = {
  name: 'Rafanutri',
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || null,
  cnpj: process.env.NEXT_PUBLIC_LEGAL_CNPJ || null,
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL || null,
  dpo: process.env.NEXT_PUBLIC_LEGAL_DPO || null,
};

/** "20 de novembro de 2026". */
export const versionLabel = (v: string) => new Date(`${v}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Documentos que faltam aceitar na versão vigente. */
export function pendingDocuments(required: LegalDocument[], accepted: Array<{ document: string; version: string }>): LegalDocument[] {
  return required.filter((d) => !accepted.some((a) => a.document === d && a.version === LEGAL_VERSIONS[d]));
}
