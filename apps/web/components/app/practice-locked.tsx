import { Briefcase } from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/app/app-header';
import { Button } from '@/components/ui/button';

/** Tela de módulo Gestão bloqueado no plano Gratuito. */
export function PracticeLocked({ title }: { title: string }) {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 py-12">
        <section aria-labelledby="locked" className="space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
          <Briefcase className="mx-auto size-10 text-primary" aria-hidden="true" />
          <h1 id="locked" className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">
            O módulo Gestão do consultório (financeiro, pacotes, CRM, agendamento online e lembretes de consulta) faz parte dos planos Essencial, Profissional e Clínica.
          </p>
          <Button asChild><Link href="/app/configuracoes/plano">Ver planos</Link></Button>
        </section>
      </main>
    </div>
  );
}
