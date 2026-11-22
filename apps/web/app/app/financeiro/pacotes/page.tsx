import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PackageCatalog } from '@/components/packages/package-catalog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PracticeLocked } from '@/components/app/practice-locked';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { hasPracticeModule } from '@/lib/modules/practice';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listPackages } from '@/lib/packages/actions';

export const metadata: Metadata = { title: 'Pacotes de consultas', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PackagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/financeiro/pacotes');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  if (!hasPracticeModule(organizations)) return <PracticeLocked title="Pacotes" />;
  const role = organizations?.[0]?.role;
  const list = await listPackages();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
        <Link href="/app/financeiro" className="text-sm text-muted-foreground hover:text-foreground">← Financeiro</Link>
        {list === null ? (
          <Alert variant="destructive"><AlertDescription>Não foi possível carregar os pacotes agora.</AlertDescription></Alert>
        ) : (
          <PackageCatalog list={list} canEdit={role === 'owner' || role === 'nutritionist'} />
        )}
      </main>
    </div>
  );
}
