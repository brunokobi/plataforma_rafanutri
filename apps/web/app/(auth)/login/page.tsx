import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { Separator } from '@/components/ui/separator';
import { safeRedirect } from '@/lib/auth/safe-redirect';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse sua conta Rafanutri.',
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = next ? safeRedirect(next) : undefined;

  return (
    <AuthShell title="Entrar na Rafanutri" subtitle="Acesse seus pacientes, planos alimentares e agenda.">
      <LoginForm next={target} />
      <Separator className="my-6" />
      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="font-semibold text-primary underline-offset-4 hover:underline">
          Criar conta grátis
        </Link>
        <span className="mt-1 block text-xs">Até 20 pacientes, sem cartão.</span>
      </p>
    </AuthShell>
  );
}
