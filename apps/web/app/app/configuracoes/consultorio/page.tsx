import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { BrandSettings } from '@/components/practice/brand-settings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';

export const metadata: Metadata = { title: 'Consultório', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PracticeSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/configuracoes/consultorio');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const org = organizations?.[0] ?? null;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-5 py-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Consultório</h1>
        {org ? (
          <BrandSettings orgId={org.id} name={org.name} color={org.brand_color} hasLogo={org.has_logo === true} canEdit={org.role === 'owner'} />
        ) : (
          <Alert variant="destructive"><AlertDescription>Não foi possível carregar o consultório agora. Atualize a página em instantes.</AlertDescription></Alert>
        )}
      </main>
    </div>
  );
}
