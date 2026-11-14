import { ArrowLeft, ChefHat } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PatientRecipeList } from '@/components/patient-area/patient-recipe-list';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getPatientArea } from '@/lib/patient-area/actions';
import { getMyRecipes } from '@/lib/recipes/actions';

export const metadata: Metadata = { title: 'Receitas', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** RN-207 — Receitas do paciente: as do plano publicado e as enviadas pelo nutricionista. */
export default async function PatientRecipesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/receitas');
  const { c } = await searchParams;
  const [area, data] = await Promise.all([getPatientArea(), getMyRecipes(c)]);
  if (area && !area.patient_account) redirect('/app');
  const record = area?.records.find((r) => r.patient_id === (data?.patient_id ?? c)) ?? area?.records[0] ?? null;
  const q = record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : '';

  return (
    <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
      <Link href={`/p${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Início
      </Link>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Receitas</h1>
      {data === null ? (
        <Alert variant="destructive"><AlertDescription>Não foi possível carregar as receitas agora. Atualize a página em instantes.</AlertDescription></Alert>
      ) : data.recipes.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border p-6 text-center">
          <ChefHat className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Nenhuma receita por enquanto</h2>
          <p className="mt-1 text-sm text-muted-foreground">As receitas do seu plano e as que {record?.professional.name ?? 'seu nutricionista'} enviar aparecem aqui.</p>
        </section>
      ) : (
        <PatientRecipeList recipes={data.recipes} query={q} />
      )}
    </PatientShell>
  );
}
