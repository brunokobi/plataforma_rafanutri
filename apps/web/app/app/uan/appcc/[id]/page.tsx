import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { HaccpEditor } from '@/components/uan/haccp-editor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getHaccpPlan } from '@/lib/uan/haccp-actions';

export const metadata: Metadata = { title: 'Plano APPCC', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/appcc/${id}`);
  const d = await getHaccpPlan(id);
  if (d === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o plano agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${d.unit.id}/appcc`} className="text-sm text-muted-foreground hover:underline">← APPCC de {d.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{d.plan.title}</h1>
            </div>
            <HaccpEditor key={`${d.plan.id}-${d.plan.status}`} data={d} />
          </>
        )}
      </main>
    </div>
  );
}
