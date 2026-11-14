import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';

/** Moldura da área do paciente: marca do consultório no topo e sair. Mobile-first. */
export function PatientShell({ practice, professional, children }: { practice: { name: string; brand_color: string | null } | null; professional?: { name: string | null; crn: string | null } | null; children: ReactNode }) {
  const color = practice?.brand_color ?? undefined;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border/60" style={color ? { borderTop: `4px solid ${color}` } : undefined}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold" style={color ? { color } : undefined}>{practice?.name ?? 'Rafanutri'}</p>
            {professional?.name && <p className="truncate text-sm text-muted-foreground">{professional.name}{professional.crn ? ` · ${professional.crn}` : ''}</p>}
          </div>
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="h-11 min-w-11" aria-label="Sair"><LogOut className="size-5" /><span className="hidden sm:inline">Sair</span></Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
