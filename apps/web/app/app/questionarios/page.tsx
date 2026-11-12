import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { TemplatesList } from '@/components/questionnaires/templates-list';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listTemplates } from '@/lib/questionnaires/repository';

export const metadata: Metadata = { title: 'Questionários', robots: { index: false } };

export default async function QuestionnairesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/questionarios');
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);
  const templates = await listTemplates();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Questionários</h1>
        <p className="mt-2 text-muted-foreground">
          Modelos de anamnese. Os padrão não mudam: duplique para adaptar ao seu consultório. Envie pela ficha do paciente, na aba Anamneses.
        </p>
        <div className="mt-8">
          {templates === null ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>Não foi possível carregar os questionários agora.</AlertDescription>
            </Alert>
          ) : (
            <TemplatesList templates={templates} />
          )}
        </div>
      </main>
    </div>
  );
}
