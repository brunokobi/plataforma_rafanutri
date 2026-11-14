import { ArrowLeft, ChefHat } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getPatientArea } from '@/lib/patient-area/actions';
import { amountText } from '@/lib/patient-area/plan-view';
import { getMyRecipe } from '@/lib/recipes/actions';
import { recipeMeta } from '@/lib/recipes/filter';
import { DIFFICULTY_LABEL } from '@/lib/recipes/types';

export const metadata: Metadata = { title: 'Receita', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PatientRecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const { id } = await params;
  const { c } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/p/receitas/${encodeURIComponent(id)}`);
  const [area, recipe] = await Promise.all([getPatientArea(), getMyRecipe(id, c)]);
  if (area && !area.patient_account) redirect('/app');
  const pid = recipe && recipe !== 'error' ? recipe.patient_id : c;
  const record = area?.records.find((r) => r.patient_id === pid) ?? area?.records[0] ?? null;
  const q = record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : '';
  const back = (
    <Link href={`/p/receitas${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> Receitas
    </Link>
  );

  if (recipe === 'error' || recipe === null) {
    return (
      <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
        {back}
        {recipe === null ? (
          <section className="rounded-2xl border border-dashed border-border p-6 text-center">
            <h1 className="font-semibold">Receita não encontrada</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ela pode ter sido retirada pelo seu nutricionista.</p>
          </section>
        ) : (
          <Alert variant="destructive"><AlertDescription>Não foi possível carregar a receita agora. Atualize a página em instantes.</AlertDescription></Alert>
        )}
      </PatientShell>
    );
  }

  const meta = recipeMeta(recipe, DIFFICULTY_LABEL);
  const portion = recipe.servings ? Math.round(recipe.yield_g / recipe.servings) : null;
  return (
    <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
      {back}
      <article className="space-y-5">
        {recipe.has_image ? (
          // eslint-disable-next-line @next/next/no-img-element -- rota privada com o token do paciente
          <img src={`/api/receitas/${recipe.id}/foto`} alt={`Foto de ${recipe.name}`} className="aspect-[4/3] w-full rounded-2xl object-cover" />
        ) : (
          <div className="flex aspect-[3/1] w-full items-center justify-center rounded-2xl bg-muted/60"><ChefHat className="size-10 text-muted-foreground" aria-hidden="true" /></div>
        )}
        <div>
          <h1 className="break-words font-display text-2xl font-semibold tracking-tight">{recipe.name}</h1>
          {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
          {portion && <p className="text-sm text-muted-foreground">1 porção ≈ {portion} g</p>}
          {recipe.description && <p className="mt-2 break-words">{recipe.description}</p>}
          {recipe.note && <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm"><span className="font-medium">Do seu nutricionista:</span> {recipe.note}</p>}
        </div>
        <section aria-labelledby="ingredientes" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="ingredientes" className="font-display text-lg font-semibold">Ingredientes</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {recipe.ingredients.map((i, k) => (
              <li key={k} className="py-2">
                <span className="break-words font-medium">{i.name ?? 'Ingrediente'}</span>
                {i.quantityG > 0 && <span className="block text-muted-foreground">{amountText(i.quantityG, i.household_measures)}</span>}
              </li>
            ))}
          </ul>
        </section>
        {recipe.instructions && (
          <section aria-labelledby="preparo" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="preparo" className="font-display text-lg font-semibold">Modo de preparo</h2>
            <p className="mt-3 whitespace-pre-line break-words text-sm">{recipe.instructions}</p>
          </section>
        )}
      </article>
    </PatientShell>
  );
}
