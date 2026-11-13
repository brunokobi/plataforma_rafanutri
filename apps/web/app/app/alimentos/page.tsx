import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { CustomFoods } from '@/components/foods/custom-foods';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listCustomFoods } from '@/lib/foods/custom';

export const metadata: Metadata = { title: 'Alimentos do consultório', robots: { index: false } };

export default async function CustomFoodsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/alimentos');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  const foods = organization ? await listCustomFoods(organization.id) : null;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Alimentos do consultório</h1>
        <p className="mt-2 text-muted-foreground">
          Alimentos que não estão na TACO (produtos pelo rótulo) e preparações da casa. Aparecem na busca do plano alimentar, marcados como próprios, e só o seu consultório vê.
        </p>
        <div className="mt-8">
          {foods === null ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>Não foi possível carregar os alimentos agora.</AlertDescription>
            </Alert>
          ) : (
            <CustomFoods foods={foods} />
          )}
        </div>
      </main>
    </div>
  );
}
