import { ChefHat } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { ModuleCard } from '@/components/app/module-card';
import { PlanSummary } from '@/components/app/plan-summary';
import { PlansComparison } from '@/components/app/plans-comparison';
import { TodayPanel } from '@/components/app/today-panel';
import { IndicatorsPanel } from '@/components/app/indicators-panel';
import { getIndicators } from '@/lib/indicators/actions';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { loadDashboard } from '@/lib/dashboard-data';
import { isSignupOpen } from '@/lib/flags';
import { buildModuleSections } from '@/lib/modules/access';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';

export const metadata: Metadata = { title: 'Início', robots: { index: false } };

export default async function AppHome({ searchParams }: { searchParams: Promise<{ nutricionista?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app');

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const organization = organizations?.[0] ?? null;
  const planCode = getUserPlan(organizations);
  const plan = getPlan(planCode);
  const { mine, others } = buildModuleSections(planCode);
  const name = user.first_name || user.email;
  const clinical = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  const { nutricionista } = await searchParams;
  const [dashboard, indicators] = clinical ? await Promise.all([loadDashboard(clinical.id), getIndicators(undefined, nutricionista)]) : [null, null];

  return (
    <div className="min-h-dvh">
      <AppHeader />

      <main className="mx-auto max-w-6xl space-y-12 px-5 py-10">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Olá, {name}</h1>
          {organization && (
            <p className="mt-1 text-sm font-medium" data-testid="organization-name">
              {organization.name}
            </p>
          )}
        </div>

        {dashboard && <TodayPanel data={dashboard} />}

        {indicators && <IndicatorsPanel data={indicators} />}

        {organizations?.some((o) => o.modules?.includes('uan')) && (
          <Link href="/app/uan" className="flex items-center gap-4 rounded-2xl border border-primary/40 bg-primary/5 p-5 hover:bg-primary/10">
            <ChefHat className="size-8 shrink-0 text-primary" />
            <span>
              <span className="block font-display text-xl font-semibold">UAN e Qualidade</span>
              <span className="block text-sm text-muted-foreground">Unidades produtoras, equipe e Boas Práticas.</span>
            </span>
          </Link>
        )}

        <p className="text-muted-foreground">
          Abaixo, os módulos da Rafanutri e o que o seu plano inclui. Cada módulo é liberado conforme o roadmap.
        </p>

        <PlanSummary plan={plan} />

        <section aria-labelledby="seus-modulos">
          <h2 id="seus-modulos" className="font-display text-2xl font-semibold tracking-tight">Seus módulos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Inclusos no plano {plan.name}.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((v) => (
              <ModuleCard key={v.module.code} view={v} />
            ))}
          </div>
        </section>

        <section aria-labelledby="outros-modulos">
          <h2 id="outros-modulos" className="font-display text-2xl font-semibold tracking-tight">Disponíveis em outros planos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Módulos que você pode liberar quando precisar.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((v) => (
              <ModuleCard key={v.module.code} view={v} />
            ))}
          </div>
        </section>

        <section id="planos" aria-labelledby="compare-planos" className="scroll-mt-24">
          <h2 id="compare-planos" className="font-display text-2xl font-semibold tracking-tight">Compare os planos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Preços dos planos pagos em definição. O plano gratuito é permanente.
          </p>
          <div className="mt-5">
            <PlansComparison currentPlan={planCode} />
          </div>
        </section>
      </main>
    </div>
  );
}
