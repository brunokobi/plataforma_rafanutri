import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { PatientTerms } from '@/components/legal/legal-texts';

export const metadata: Metadata = { title: 'Termos de Uso para Pacientes', description: 'Termos da área do paciente da Rafanutri.', alternates: { canonical: '/termos/paciente' } };

export default function PatientTermsPage() {
  return <LegalPage doc="patient_terms"><PatientTerms /></LegalPage>;
}
