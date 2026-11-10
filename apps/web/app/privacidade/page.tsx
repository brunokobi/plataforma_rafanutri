import type { Metadata } from 'next';
import { SimplePage } from '@/components/layout/simple-page';

export const metadata: Metadata = { title: 'Política de privacidade' };

export default function PrivacyPage() {
  return (
    <SimplePage title="Política de privacidade">
      <p>A política de privacidade da Rafanutri está em elaboração e será publicada antes da abertura do cadastro.</p>
    </SimplePage>
  );
}
