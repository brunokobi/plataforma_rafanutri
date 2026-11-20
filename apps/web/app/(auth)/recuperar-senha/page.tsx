import type { Metadata } from 'next';
import { RequestResetForm } from '@/components/auth/password-forms';
import { SimplePage } from '@/components/layout/simple-page';

export const metadata: Metadata = { title: 'Recuperar senha', robots: { index: false } };

export default function RecoverPasswordPage() {
  return (
    <SimplePage title="Recuperar senha">
      <RequestResetForm />
    </SimplePage>
  );
}
