import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { IndicatorsPanel } from '@/components/app/indicators-panel';
import { TodayPanel } from '@/components/app/today-panel';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { loadDashboard } from '@/lib/dashboard-data';
import { isSignupOpen } from '@/lib/flags';
import { getIndicators } from '@/lib/indicators/actions';

export const metadata: Metadata = { title: 'Clínico', robots: { index: false } };

/** Entrada do módulo Clínico: o dia do consultório e os indicadores (antes ficavam na tela inicial). */
export default async function ClinicalHome({ searchParams }: { searchParams: Promise<{ nutricionista?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/clinico');

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const clinical = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  const { nutricionista } = await searchParams;
  const [dashboard, indicators] = clinical ? await Promise.all([loadDashboard(clinical.id), getIndicators(undefined, nutricionista)]) : [null, null];

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-10 px-5 py-10">
        <div>
          <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground">← Módulos</Link>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Clínico e Esportivo</h1>
          {clinical && <p className="mt-1 text-sm font-medium">{clinical.name}</p>}
        </div>
        {dashboard ? (
          <TodayPanel data={dashboard} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            O painel do consultório aparece para o responsável e para os nutricionistas da equipe.
          </p>
        )}
        {indicators && <IndicatorsPanel data={indicators} />}
      </main>
    </div>
  );
}
