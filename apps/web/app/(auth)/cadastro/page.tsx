import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignupForm } from '@/components/auth/signup-form';
import { Separator } from '@/components/ui/separator';
import { isSignupOpen } from '@/lib/flags';

export const metadata: Metadata = {
  title: 'Criar conta grátis',
  description: 'Crie sua conta na Rafanutri: grátis até 20 pacientes, sem cartão.',
};

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <AuthShell title="Crie sua conta grátis" subtitle="Até 20 pacientes ativos, sem cartão e sem prazo.">
      <SignupForm signupOpen={isSignupOpen()} />
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
