import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { RecipeLibrary } from '@/components/recipes/recipe-library';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listRecipes } from '@/lib/recipes/actions';

export const metadata: Metadata = { title: 'Receitas', robots: { index: false } };

export default async function RecipesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/receitas');
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);
  const recipes = await listRecipes();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Receitas</h1>
        <p className="mt-2 text-muted-foreground">
          Receitas do consultório com ingredientes, porções, tempo e foto. Entram na busca do plano alimentar e podem ser enviadas aos pacientes, que as veem na área do paciente.
        </p>
        <div className="mt-8">
          {recipes === null ? (
            <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar as receitas agora.</AlertDescription></Alert>
          ) : (
            <RecipeLibrary recipes={recipes} />
          )}
        </div>
      </main>
    </div>
  );
}
