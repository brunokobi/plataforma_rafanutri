import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PlanTemplatesList } from '@/components/meal-plans/plan-templates-list';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { foodsByIdsRepo } from '@/lib/foods/repository';
import { planFoodIds } from '@/lib/meal-plans/schema';
import { listPlanTemplates } from '@/lib/meal-plans/templates';

export const metadata: Metadata = { title: 'Modelos de plano', robots: { index: false } };

export default async function PlanTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/modelos-de-plano');
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);

  const templates = await listPlanTemplates();
  const list = Array.isArray(templates) ? templates : [];
  const foods = list.length ? await foodsByIdsRepo([...new Set(list.flatMap((t) => planFoodIds(t.meals)))]) : [];
  const foodNames = Object.fromEntries((foods ?? []).map((f) => [f.id, f.name]));

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Modelos de plano</h1>
        <p className="mt-2 text-muted-foreground">
          Planos prontos para reaproveitar. Aplique a um paciente na aba Plano alimentar da ficha, com ou sem ajuste à meta de calorias.
        </p>
        <div className="mt-8">
          {Array.isArray(templates) ? (
            <PlanTemplatesList templates={templates} foodNames={foodNames} />
          ) : (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>
                {templates === 'unavailable' ? 'Os modelos de plano ainda estão sendo ativados no servidor.' : 'Não foi possível carregar os modelos agora.'}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </main>
    </div>
  );
}
