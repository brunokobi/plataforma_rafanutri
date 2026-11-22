import type { Metadata } from 'next';
import { LoginScreen } from '@/components/auth/login-screen';
import { googleConfig, googleErrorMessage } from '@/lib/auth/google';
import { safeRedirect } from '@/lib/auth/safe-redirect';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse sua conta Rafanutri.',
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; google?: string }> }) {
  const { next, google } = await searchParams;
  const target = next ? safeRedirect(next) : undefined;
  return <LoginScreen next={target} google={Boolean(await googleConfig())} googleError={googleErrorMessage(google)} />;
}
