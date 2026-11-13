import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getRecipe } from '@/lib/foods/custom';
import { foodsByIdsRepo } from '@/lib/foods/repository';
import { RecipeEditor } from './recipe-editor';

export const metadata: Metadata = { title: 'Editar preparação', robots: { index: false } };

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/alimentos/preparacoes/${encodeURIComponent(id)}`);
  if (!/^\d+$/.test(id)) notFound();
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);

  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  const foods = (await foodsByIdsRepo([id, ...recipe.items.map((i) => i.foodId)])) ?? [];
  const byId = new Map(foods.map((f) => [f.id, f]));
  const self = byId.get(id);
  const lines = recipe.items.flatMap((i) => {
    const food = byId.get(i.foodId);
    return food ? [{ food, quantityG: i.quantityG }] : [];
  });

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
        <Link href="/app/alimentos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar aos alimentos
        </Link>
        <RecipeEditor
          initial={{ id, name: self?.name ?? '', group: self?.group ?? 'Preparações', yield_g: recipe.yield_g, servings: recipe.servings, instructions: recipe.instructions, lines }}
          missing={recipe.items.length - lines.length}
        />
      </main>
    </div>
  );
}
