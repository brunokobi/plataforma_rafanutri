import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { MenuEditor } from '@/components/uan/menu-editor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getMenu } from '@/lib/uan/menu-actions';

export const metadata: Metadata = { title: 'Cardápio', robots: { index: false } };

export default async function MenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/cardapios/${id}`);
  const d = await getMenu(id);
  if (d === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o cardápio agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${d.unit.id}/cardapios`} className="text-sm text-muted-foreground hover:underline">← Cardápios de {d.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{d.cycle.name}</h1>
            </div>
            <MenuEditor key={`${d.cycle.id}-${d.cycle.status}`} detail={d} />
          </>
        )}
      </main>
    </div>
  );
}
