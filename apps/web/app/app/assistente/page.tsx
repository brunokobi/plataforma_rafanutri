import { AlertCircle, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Assistant } from '@/components/ai/assistant';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAiStatus } from '@/lib/ai/actions';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Assistente de IA', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ paciente?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/assistente');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  const [status, patients] = await Promise.all([getAiStatus(), organization ? listPatients(organization.id) : null]);
  const sp = await searchParams;
  const initial = sp.paciente && isUuid(sp.paciente) && patients?.some((p) => p.id === sp.paciente) ? sp.paciente : null;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Assistente de IA</h1>
          <p className="text-sm text-muted-foreground">Sugestões para acelerar a consulta. A IA sugere, você decide.</p>
        </div>
        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          Usamos modelos de IA gratuitos. Para proteger o paciente, nunca enviamos nome, CPF, contatos ou datas: só idade, sexo, medidas e as respostas da anamnese, sem identificação. Não escreva dados pessoais nos campos de texto.
        </p>
        {!organization ? (
          <Alert><AlertCircle /><AlertDescription>O assistente é para owner e nutricionistas do consultório.</AlertDescription></Alert>
        ) : status === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o assistente agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : !status.enabled ? (
          <Alert><AlertCircle /><AlertDescription>O assistente não está disponível no seu plano. <Link href="/app/configuracoes/plano" className="font-medium underline">Ver planos</Link></AlertDescription></Alert>
        ) : (
          <Assistant
            status={status}
            patients={(patients ?? []).filter((p) => p.status === 'active').map((p) => ({ id: p.id, name: p.full_name }))}
            initialPatient={initial}
          />
        )}
      </main>
    </div>
  );
}
