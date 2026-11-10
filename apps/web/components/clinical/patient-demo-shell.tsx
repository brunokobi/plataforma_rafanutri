'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { demoPatient } from '@/lib/demo/patient';
import { cn } from '@/lib/utils';

/** Cabeçalho da paciente de exemplo com as abas do prontuário. */
export function PatientDemoShell({ basePath, backHref, children }: { basePath: string; backHref: string; children: ReactNode }) {
  const pathname = usePathname();
  const tabs = [
    { href: basePath, label: 'Resumo' },
    { href: `${basePath}/avaliacao`, label: 'Avaliação' },
    { href: `${basePath}/plano`, label: 'Plano alimentar' },
  ];
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Logo href={backHref} />
          <ThemeToggle />
        </div>
      </header>
      <div className="border-b border-border/60 bg-muted/30">
        <div className="mx-auto max-w-7xl px-5 pt-6">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar aos pacientes
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-primary/15 font-semibold text-primary">MC</span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">{demoPatient.name}</h1>
              <p className="text-sm text-muted-foreground">
                {demoPatient.ageYears} anos · {demoPatient.heightCm} cm · {demoPatient.objective}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Badge variant="outline">Paciente de exemplo</Badge>
              {demoPatient.restrictions.map((r) => (
                <Badge key={r} className="bg-accent text-accent-foreground">{r}</Badge>
              ))}
            </div>
          </div>
          <nav aria-label="Seções do paciente" className="mt-5 flex gap-1">
            {tabs.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn('rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium', active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
