import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PurchasingView } from '@/components/uan/purchasing-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getNeeds, getOrders } from '@/lib/uan/purchasing-actions';

export const metadata: Metadata = { title: 'Compras', robots: { index: false } };

export default async function PurchasingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ de?: string; ate?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}/compras`);
  const [needs, orders] = await Promise.all([getNeeds(id, sp.de, sp.ate), getOrders(id)]);
  if (needs === undefined || orders === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {needs === null || orders === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar as compras agora (só owner, gestor, RT e estoquista).</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${id}`} className="text-sm text-muted-foreground hover:underline">← {needs.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Compras</h1>
            </div>
            <PurchasingView key={`${needs.from}-${needs.to}`} needs={needs} orders={orders.items} />
          </>
        )}
      </main>
    </div>
  );
}
