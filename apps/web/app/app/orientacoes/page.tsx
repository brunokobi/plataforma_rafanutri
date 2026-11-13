import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { SnippetsManager } from '@/components/snippets/snippets-manager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listSnippets } from '@/lib/snippets/actions';

export const metadata: Metadata = { title: 'Orientações', robots: { index: false } };

export default async function SnippetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/orientacoes');
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);
  const snippets = await listSnippets();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Orientações</h1>
        <p className="mt-2 text-muted-foreground">Textos que você repete nos planos, organizados por categoria. No editor de plano, use “Inserir orientação” ou digite / no campo de orientações.</p>
        <div className="mt-8">
          {snippets === null ? (
            <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar as orientações agora.</AlertDescription></Alert>
          ) : (
            <SnippetsManager snippets={snippets} />
          )}
        </div>
      </main>
    </div>
  );
}
