import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { InventoryView } from '@/components/uan/stock-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getInventory } from '@/lib/uan/stock-actions';

export const metadata: Metadata = { title: 'Inventário', robots: { index: false } };

export default async function InventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/inventarios/${id}`);
  const d = await getInventory(id);
  if (d === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o inventário agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${d.unit.id}/estoque`} className="text-sm text-muted-foreground hover:underline">← Estoque de {d.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Inventário</h1>
            </div>
            <InventoryView key={d.inventory.status} data={d} />
          </>
        )}
      </main>
    </div>
  );
}
