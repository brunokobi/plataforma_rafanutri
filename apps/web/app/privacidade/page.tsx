import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { PrivacyPolicy } from '@/components/legal/legal-texts';

export const metadata: Metadata = { title: 'Política de Privacidade', description: 'Como a Rafanutri trata os dados pessoais (LGPD).', alternates: { canonical: '/privacidade' } };

export default function PrivacyPage() {
  return <LegalPage doc="privacy"><PrivacyPolicy /></LegalPage>;
}
