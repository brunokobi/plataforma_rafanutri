import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { OrderView } from '@/components/uan/purchasing-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrder } from '@/lib/uan/purchasing-actions';

export const metadata: Metadata = { title: 'Pedido de compra', robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/pedidos/${id}`);
  const d = await getOrder(id);
  if (d === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o pedido agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${d.unit.id}/compras`} className="text-sm text-muted-foreground hover:underline">← Compras de {d.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Pedido — {d.supplier?.name ?? 'sem fornecedor'}</h1>
            </div>
            <OrderView key={d.order.status} detail={d} />
          </>
        )}
      </main>
    </div>
  );
}
