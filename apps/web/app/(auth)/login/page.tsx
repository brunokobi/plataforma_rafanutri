import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { ParallaxScene } from '@/components/auth/parallax-scene';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
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
    <div className="relative min-h-dvh lg:grid lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
      {/* Celular: a cena vira fundo fixo; desktop: coluna da direita */}
      <ParallaxScene className="fixed inset-0 -z-10 lg:sticky lg:top-0 lg:order-2 lg:z-0 lg:h-dvh" />
      <div className="fixed inset-0 -z-10 bg-black/45 backdrop-blur-[2px] lg:hidden" />

      <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:order-1 lg:bg-background">
        <header className="flex items-center justify-between">
          <Logo className="text-white lg:text-foreground" />
          <ThemeToggle className="text-white hover:bg-white/10 hover:text-white lg:text-foreground lg:hover:bg-accent lg:hover:text-accent-foreground" />
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-background/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Entrar na Rafanutri</h1>
            <p className="mt-2 text-sm text-muted-foreground">Acesse seus pacientes, planos alimentares e agenda.</p>

            <div className="mt-8">
              <LoginForm next={target} />
            </div>

            <Separator className="my-6" />

            <p className="text-center text-sm text-muted-foreground">
              Ainda não tem conta?{' '}
              <Link href="/cadastro" className="font-semibold text-primary underline-offset-4 hover:underline">
                Criar conta grátis
              </Link>
              <span className="mt-1 block text-xs">Até 20 pacientes, sem cartão.</span>
            </p>
          </div>
        </div>

        <footer className="text-center text-xs text-white/80 lg:text-muted-foreground">
          <Link href="/termos" className="hover:underline">Termos</Link>
          <span className="mx-2">·</span>
          <Link href="/privacidade" className="hover:underline">Privacidade</Link>
          <span className="mx-2">·</span>© {new Date().getFullYear()} Rafanutri
        </footer>
      </main>
    </div>
  );
}
