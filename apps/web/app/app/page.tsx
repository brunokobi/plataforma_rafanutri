import { LogOut } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Início', robots: { index: false } };

export default async function AppHome() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app');
  const name = user.first_name || user.email;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Logo href="/app" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={signOut}>
              <Button type="submit" variant="outline">
                <LogOut className="size-4" /> Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Área do nutricionista</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Bem-vindo, {name}</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Seu acesso está funcionando. Pacientes, agenda e planos alimentares chegam nas próximas entregas.
        </p>
      </main>
    </div>
  );
}
