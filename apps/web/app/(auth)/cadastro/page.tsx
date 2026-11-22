import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { GoogleButton, OrDivider } from '@/components/auth/google-button';
import { SignupForm } from '@/components/auth/signup-form';
import { googleConfig, googleErrorMessage } from '@/lib/auth/google';
import { Separator } from '@/components/ui/separator';
import { isSignupOpen } from '@/lib/flags';

export const metadata: Metadata = {
  title: 'Criar conta grátis',
  description: 'Crie sua conta na Rafanutri: grátis até 20 pacientes, sem cartão.',
};

export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const open = isSignupOpen();
  const google = open && Boolean(await googleConfig());
  const googleError = googleErrorMessage((await searchParams).google);
  return (
    <AuthShell title="Crie sua conta grátis" subtitle="Até 20 pacientes ativos, sem cartão e sem prazo.">
      {googleError && <p role="alert" className="mb-5 rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">{googleError}</p>}
      {google && (
        <div className="mb-6 space-y-3">
          <GoogleButton intent="signup" />
          <p className="text-center text-xs text-muted-foreground">
            Ao continuar com o Google, você aceita os <Link href="/termos" className="font-medium text-primary underline-offset-4 hover:underline">Termos de Uso</Link> e a{' '}
            <Link href="/privacidade" className="font-medium text-primary underline-offset-4 hover:underline">Política de Privacidade</Link>.
          </p>
          <OrDivider />
        </div>
      )}
      <SignupForm signupOpen={open} />
      <Separator className="my-6" />
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
