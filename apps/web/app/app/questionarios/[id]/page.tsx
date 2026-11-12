import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { QuestionnaireFields } from '@/components/forms/questionnaire-fields';
import { TemplateEditor } from '@/components/questionnaires/template-editor';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { isUuid } from '@/lib/patients/schema';
import { getTemplate } from '@/lib/questionnaires/repository';
import { DuplicateButton } from './duplicate-button';

export const metadata: Metadata = { title: 'Editar questionário', robots: { index: false } };

export default async function QuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/questionarios/${encodeURIComponent(id)}`);
  if (!isUuid(id)) notFound();
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);
  const template = await getTemplate(id);
  if (template === undefined) notFound();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
        <Link href="/app/questionarios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar aos questionários
        </Link>
        {template === null ? (
          <p className="text-sm text-destructive">Não foi possível carregar o questionário agora.</p>
        ) : template.organization_id ? (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Editar questionário</h1>
            <TemplateEditor id={template.id} initial={{ name: template.name, description: template.description, schema: template.schema }} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight">{template.name}</h1>
                <p className="mt-1 text-muted-foreground">Modelo padrão (somente leitura). Duplique para adaptar.</p>
              </div>
              <DuplicateButton id={template.id} />
            </div>
            <div className="rounded-2xl border border-border p-5">
              <QuestionnaireFields schema={template.schema} answers={{}} onChange={() => {}} prefix="ro" />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
