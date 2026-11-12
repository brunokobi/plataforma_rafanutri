import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';

/** Cabeçalho da área logada. `withSignOut=false` nas pré-visualizações locais. */
export function AppHeader({ homeHref = '/app', patientsHref = '/app/pacientes', withSignOut = true }: { homeHref?: string; patientsHref?: string; withSignOut?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-6">
          <Logo href={homeHref} />
          <nav aria-label="Área logada" className="hidden items-center gap-5 text-sm font-medium text-muted-foreground sm:flex">
            <Link href={homeHref} className="hover:text-foreground">Módulos</Link>
            <Link href={patientsHref} className="hover:text-foreground">Pacientes</Link>
            <Link href="/app/agenda" className="hover:text-foreground">Agenda</Link>
            <Link href="/app/questionarios" className="hover:text-foreground">Questionários</Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {withSignOut && (
            <form action={signOut}>
              <Button type="submit" variant="outline">
                <LogOut className="size-4" /> Sair
              </Button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
