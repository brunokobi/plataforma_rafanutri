import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { ModuleCard } from '@/components/app/module-card';
import { PlanSummary } from '@/components/app/plan-summary';
import { PlansComparison } from '@/components/app/plans-comparison';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { buildModuleSections } from '@/lib/modules/access';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { getUanContext } from '@/lib/uan/actions';

export const metadata: Metadata = { title: 'Início', robots: { index: false } };

/** Tela depois do login: todos os módulos, para escolher por onde entrar. */
export default async function AppHome() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app');

  const organizations = await getMyOrganizations();
  // Sem consultório: pode ser só da equipe de uma unidade UAN (RN-220)
  const uanOrgs = organizations?.length === 0 ? await getUanContext() : null;
  const target = landingRedirect('app', organizations, isSignupOpen(), Boolean(uanOrgs?.length));
  if (target) redirect(target);

  const organization = organizations?.[0] ?? null;
  const planCode = getUserPlan(organizations);
  const plan = getPlan(planCode);
  const enabled = [...new Set((organizations ?? []).flatMap((o) => o.modules ?? []))];
  const { mine, others } = buildModuleSections(planCode, undefined, enabled);
  // Primeiro o que já abre, depois o incluso em construção
  const ready = [...mine.filter((v) => v.status === 'available'), ...mine.filter((v) => v.status !== 'available')];
  const name = user.first_name || user.email;

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

        <section aria-labelledby="escolha-modulo">
          <h2 id="escolha-modulo" className="font-display text-2xl font-semibold tracking-tight">Escolha um módulo</h2>
          <p className="mt-1 text-sm text-muted-foreground">Os módulos do seu plano {plan.name}. Clique em “Abrir” para entrar.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ready.map((v) => (
              <ModuleCard key={v.module.code} view={v} />
            ))}
          </div>
        </section>

        {others.length > 0 && (
          <section aria-labelledby="outros-modulos">
            <h2 id="outros-modulos" className="font-display text-2xl font-semibold tracking-tight">Disponíveis em outros planos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Módulos que você pode liberar quando precisar.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((v) => (
                <ModuleCard key={v.module.code} view={v} />
              ))}
            </div>
          </section>
        )}

        <PlanSummary plan={plan} />

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
