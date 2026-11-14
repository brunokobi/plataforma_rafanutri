import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getTacoFood } from '@/lib/foods/taco';
import { formatNutrient } from '@/lib/foods/taco-data';

export const metadata: Metadata = { title: 'Alimento da TACO', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function TacoFoodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/alimentos/taco/${encodeURIComponent(id)}`);
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const food = await getTacoFood(id);
  if (!food) notFound();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <div className="space-y-1">
          <Link href={`/app/alimentos/taco?grupo=${encodeURIComponent(food.group)}`} className="text-sm text-muted-foreground hover:underline">← {food.group}</Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{food.name}</h1>
          <p className="text-sm text-muted-foreground">TACO nº {food.code ?? '—'} · valores por 100 g da parte comestível</p>
        </div>

        <section aria-labelledby="taco-comp" className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption id="taco-comp" className="px-3 py-2 text-left font-medium">Composição</caption>
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Nutriente</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Por 100 g</th>
                {food.householdMeasures[0] && (
                  <th scope="col" className="px-3 py-2 text-right font-medium">{food.householdMeasures[0].label} ({food.householdMeasures[0].grams.toLocaleString('pt-BR')} g)</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {food.nutrients.map((n) => (
                <tr key={n.code}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">{n.name} <span className="text-muted-foreground">({n.unit})</span></th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNutrient(n)}</td>
                  {food.householdMeasures[0] && <td className="px-3 py-1.5 text-right tabular-nums">{formatNutrient(n, food.householdMeasures[0].grams / 100)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {food.householdMeasures.length > 0 && (
          <section aria-labelledby="taco-measures" className="space-y-2">
            <h2 id="taco-measures" className="font-medium">Medidas caseiras</h2>
            <ul className="flex flex-wrap gap-2 text-sm">
              {food.householdMeasures.map((m) => (
                <li key={m.label} className="rounded-md border px-2.5 py-1">{m.label}: {m.grams.toLocaleString('pt-BR')} g</li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          NA = não analisado. Tr = traço. Fonte: {food.source.citation ?? `${food.source.name}${food.source.version ? `, ${food.source.version}` : ''}`}
        </p>
      </main>
    </div>
  );
}
