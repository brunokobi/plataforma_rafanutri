import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';

/** Página simples com cabeçalho, usada nas telas provisórias. */
export function SimplePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <div className="mt-6 space-y-4 text-muted-foreground">{children}</div>
        <p className="mt-10">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">← Voltar para o início</Link>
        </p>
      </main>
    </div>
  );
}
