import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { MenuPlanningView } from '@/components/uan/menu-planning-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getUanContext } from '@/lib/uan/actions';
import { getMenuPlanning } from '@/lib/uan/menu-planning-actions';

export const metadata: Metadata = { title: 'Perfis e regras do cardápio', robots: { index: false } };

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan/perfis');
  if (!empresa) {
    const orgs = await getUanContext();
    redirect(orgs?.[0] ? `/app/uan/perfis?empresa=${orgs[0].id}` : '/app/uan');
  }
  const data = await getMenuPlanning(empresa);
  if (data === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← UAN e Qualidade</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Perfis e regras do cardápio</h1>
              <p className="text-sm text-muted-foreground">{data.organization.name}</p>
            </div>
            <MenuPlanningView data={data} />
          </>
        )}
      </main>
    </div>
  );
}
