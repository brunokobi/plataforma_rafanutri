import Link from 'next/link';
import type { ReactNode } from 'react';
import { ParallaxScene } from '@/components/auth/parallax-scene';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';

/** Moldura das telas de autenticação: formulário à esquerda e cena parallax à direita (ou de fundo no celular). */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh lg:grid lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
      <ParallaxScene className="fixed inset-0 -z-10 lg:sticky lg:top-0 lg:order-2 lg:z-0 lg:h-dvh" />
      <div className="fixed inset-0 -z-10 bg-black/45 backdrop-blur-[2px] lg:hidden" />

      <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:order-1 lg:bg-background">
        <header className="flex items-center justify-between">
          <Logo className="text-white lg:text-foreground" />
          <ThemeToggle className="text-white hover:bg-white/10 hover:text-white lg:text-foreground lg:hover:bg-accent lg:hover:text-accent-foreground" />
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-background/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
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
