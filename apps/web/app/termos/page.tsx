import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { ProfessionalTerms } from '@/components/legal/legal-texts';

export const metadata: Metadata = { title: 'Termos de Uso para Profissionais', description: 'Contrato de uso da Rafanutri para nutricionistas, consultórios e empresas.', alternates: { canonical: '/termos' } };

export default function TermsPage() {
  return <LegalPage doc="professional_terms"><ProfessionalTerms /></LegalPage>;
}
