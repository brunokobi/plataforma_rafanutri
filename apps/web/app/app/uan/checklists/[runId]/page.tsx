import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { ChecklistResult } from '@/components/uan/checklist-result';
import { ChecklistRunner } from '@/components/uan/checklist-runner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getChecklistRun } from '@/lib/uan/checklist-actions';

export const metadata: Metadata = { title: 'Checklist', robots: { index: false } };

export default async function ChecklistRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/checklists/${runId}`);
  const detail = await getChecklistRun(runId);
  if (detail === undefined) notFound();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {detail === null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>Não foi possível carregar o checklist agora. Atualize a página em instantes.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${detail.unit.id}`} className="text-sm text-muted-foreground hover:underline">← {detail.unit.name}</Link>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{detail.run.template_name}</h1>
            </div>
            {detail.can_answer ? <ChecklistRunner key={detail.run.id} detail={detail} /> : <ChecklistResult detail={detail} />}
          </>
        )}
      </main>
    </div>
  );
}
