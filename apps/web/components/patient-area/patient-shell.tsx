import { ArrowLeftRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TermsGate } from '@/components/legal/terms-gate';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';
import { PatientBottomNav } from './patient-bottom-nav';

/** Moldura da área do paciente: marca do consultório no topo e sair. Mobile-first. */
export function PatientShell({ practice, professional, canSwitch = false, children }: { practice: { id?: string; name: string; brand_color: string | null; has_logo?: boolean } | null; professional?: { name: string | null; crn: string | null } | null; canSwitch?: boolean; children: ReactNode }) {
  const color = practice?.brand_color ?? undefined;
  return (
    <div className="min-h-dvh">
      <TermsGate profile="patient" />
      <header className="border-b border-border/60" style={color ? { borderTop: `4px solid ${color}` } : undefined}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          {practice?.has_logo && practice.id && (
            // eslint-disable-next-line @next/next/no-img-element -- rota privada com o token do paciente
            <img src={`/api/consultorio/${practice.id}/logo`} alt="" className="size-10 shrink-0 rounded-lg bg-white object-contain p-1" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold" style={color ? { color } : undefined}>{practice?.name ?? 'Rafanutri'}</p>
            {professional?.name && <p className="truncate text-sm text-muted-foreground">{professional.name}{professional.crn ? ` · ${professional.crn}` : ''}</p>}
          </div>
          {canSwitch && (
            <Button asChild variant="ghost" className="h-11 min-w-11"><Link href="/p/nutricionistas" aria-label="Trocar de nutricionista"><ArrowLeftRight className="size-5" /><span className="hidden sm:inline">Trocar</span></Link></Button>
          )}
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="h-11 min-w-11" aria-label="Sair"><LogOut className="size-5" /><span className="hidden sm:inline">Sair</span></Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-6">{children}</main>
      <PatientBottomNav color={color} />
    </div>
  );
}
