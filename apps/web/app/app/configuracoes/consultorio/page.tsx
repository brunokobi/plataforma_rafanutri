import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { BrandSettings } from '@/components/practice/brand-settings';
import { WorkScheduleForm } from '@/components/practice/work-schedule';
import { scheduleOf } from '@/lib/appointments/schema';
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
          <BrandSettings orgId={org.id} name={org.name} color={org.brand_color} hasLogo={org.has_logo === true} canEdit={org.role === 'owner'} taxId={org.receipt_tax_id ?? null} />
        ) : (
          <Alert variant="destructive"><AlertDescription>Não foi possível carregar o consultório agora. Atualize a página em instantes.</AlertDescription></Alert>
        )}
        {org && <WorkScheduleForm orgId={org.id} initial={scheduleOf(org)} canEdit={org.role === 'owner'} />}
        {org?.role === 'owner' && (
          <section className="space-y-1 rounded-lg border p-4">
            <h2 className="font-medium">Auditoria</h2>
            <p className="text-sm text-muted-foreground">Veja quem criou, alterou, abriu ou exportou dados de pacientes e do financeiro.</p>
            <Link href="/app/configuracoes/auditoria" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Abrir auditoria</Link>
          </section>
        )}
      </main>
    </div>
  );
}
