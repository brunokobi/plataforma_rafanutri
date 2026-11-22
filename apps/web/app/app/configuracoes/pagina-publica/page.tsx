import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PublicProfileForm } from '@/components/booking/public-profile-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PracticeLocked } from '@/components/app/practice-locked';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { hasPracticeModule } from '@/lib/modules/practice';
import { getCurrentUser } from '@/lib/auth/session';
import { getPublicProfileConfig } from '@/lib/booking/actions';
import { isSignupOpen } from '@/lib/flags';

export const metadata: Metadata = { title: 'Página pública', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PublicProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/configuracoes/pagina-publica');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  if (!hasPracticeModule(organizations)) return <PracticeLocked title="Página pública e agendamento online" />;
  const org = organizations?.[0] ?? null;
  const data = org?.role === 'owner' ? await getPublicProfileConfig(org.id) : null;
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <Link href="/app/configuracoes/consultorio" className="text-sm text-muted-foreground hover:text-foreground">← Consultório</Link>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Página pública e agendamento online</h1>
        {org?.role !== 'owner' ? (
          <p className="text-sm text-muted-foreground">Só o responsável (owner) do consultório configura a página pública.</p>
        ) : !data ? (
          <Alert variant="destructive"><AlertDescription>Não foi possível carregar agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : (
          <PublicProfileForm orgId={org.id} data={data} siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rafanutri.brunokobi.tech'} />
        )}
      </main>
    </div>
  );
}
