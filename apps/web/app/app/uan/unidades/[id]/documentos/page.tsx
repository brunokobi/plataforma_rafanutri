import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { DocumentsList } from '@/components/uan/documents-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getUnitDocuments } from '@/lib/uan/document-actions';

export const metadata: Metadata = { title: 'Documentos de Boas Práticas', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}/documentos`);
  const d = await getUnitDocuments(id);
  if (d === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${id}`} className="text-sm text-muted-foreground hover:underline">← {d.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Documentos de Boas Práticas</h1>
            </div>
            <DocumentsList data={d} />
          </>
        )}
      </main>
    </div>
  );
}
