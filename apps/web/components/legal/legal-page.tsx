import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { LEGAL_PATH, LEGAL_TITLE, LEGAL_VERSIONS, versionLabel, type LegalDocument } from '@/lib/legal/info';

/** Página de documento legal: título, versão vigente, texto e links para os outros documentos. */
export function LegalPage({ doc, children }: { doc: LegalDocument; children: ReactNode }) {
  const others = (Object.keys(LEGAL_TITLE) as LegalDocument[]).filter((d) => d !== doc);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{LEGAL_TITLE[doc]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Versão vigente desde {versionLabel(LEGAL_VERSIONS[doc])}</p>
        <article className="mt-8 space-y-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">{children}</article>
        <nav aria-label="Outros documentos" className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
          {others.map((d) => <Link key={d} href={LEGAL_PATH[d]} className="font-medium text-primary hover:underline">{LEGAL_TITLE[d]}</Link>)}
          <Link href="/" className="text-muted-foreground hover:underline">Início</Link>
        </nav>
      </main>
    </div>
  );
}
