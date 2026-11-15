import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { SheetEditor } from '@/components/uan/sheet-editor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getSheet } from '@/lib/uan/sheet-actions';

export const metadata: Metadata = { title: 'Ficha técnica', robots: { index: false } };

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/fichas/${id}`);
  const d = await getSheet(id);
  if (d === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar a ficha agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/fichas?empresa=${d.sheet.organization_id}`} className="text-sm text-muted-foreground hover:underline">← Fichas técnicas</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{d.sheet.name}</h1>
            </div>
            <SheetEditor key={`${d.sheet.id}-${d.sheet.status}`} detail={d} />
          </>
        )}
      </main>
    </div>
  );
}
