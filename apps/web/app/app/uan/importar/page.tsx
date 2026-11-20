import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { ImportView } from '@/components/uan/import-view';
import { getCurrentUser } from '@/lib/auth/session';
import { getUanContext } from '@/lib/uan/actions';

export const metadata: Metadata = { title: 'Importar planilhas', robots: { index: false } };

/** RN-169 — Implantação: importar fornecedores, insumos e fichas técnicas de planilhas do cliente. */
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan/importar');
  const orgs = await getUanContext();
  if (!empresa) redirect(orgs?.[0] ? `/app/uan/importar?empresa=${orgs[0].id}` : '/app/uan');
  const org = orgs?.find((o) => o.id === empresa);
  if (!org) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        <div>
          <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← UAN e Qualidade</Link>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Importar planilhas</h1>
          <p className="text-sm text-muted-foreground">Traga o cadastro do cliente de uma vez: fornecedores, insumos com preço e fichas técnicas.</p>
        </div>
        <ImportView orgId={org.id} orgName={org.name} />
      </main>
    </div>
  );
}
