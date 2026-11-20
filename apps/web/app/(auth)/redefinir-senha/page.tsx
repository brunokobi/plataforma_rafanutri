import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/password-forms';
import { SimplePage } from '@/components/layout/simple-page';

export const metadata: Metadata = { title: 'Criar senha nova', robots: { index: false }, referrer: 'no-referrer' };

/** Link do e-mail de recuperação (?token=…). O token não vai para outros sites (sem referrer). */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <SimplePage title="Criar senha nova">
      <ResetPasswordForm token={typeof token === 'string' ? token : ''} />
    </SimplePage>
  );
}
