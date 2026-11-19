import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { DocumentView } from '@/components/uan/documents-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getDocument } from '@/lib/uan/document-actions';

export const metadata: Metadata = { title: 'Documento', robots: { index: false } };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/documentos/${id}`);
  const d = await getDocument(id);
  if (d === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o documento agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${d.unit.id}/documentos`} className="text-sm text-muted-foreground hover:underline">← Documentos de {d.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{d.document.title}</h1>
            </div>
            <DocumentView key={`${d.document.id}-${d.current?.id ?? 'none'}-${d.draft?.id ?? 'none'}`} data={d} />
          </>
        )}
      </main>
    </div>
  );
}
