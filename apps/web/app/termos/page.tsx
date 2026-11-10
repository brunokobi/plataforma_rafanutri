import type { Metadata } from 'next';
import { SimplePage } from '@/components/layout/simple-page';

export const metadata: Metadata = { title: 'Termos de uso' };

export default function TermsPage() {
  return (
    <SimplePage title="Termos de uso">
      <p>Os termos de uso da Rafanutri estão em elaboração e serão publicados antes da abertura do cadastro.</p>
    </SimplePage>
  );
}
