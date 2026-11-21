import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { NotificationSettingsView } from '@/components/notifications/settings-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getNotificationLog, getNotificationOverview } from '@/lib/notifications/actions';

export const metadata: Metadata = { title: 'Avisos aos pacientes', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/configuracoes/avisos');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const [overview, log] = await Promise.all([getNotificationOverview(), getNotificationLog()]);
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <Link href="/app/configuracoes/consultorio" className="text-sm text-muted-foreground hover:text-foreground">← Consultório</Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Avisos aos pacientes</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O Telegram é o canal principal: gratuito, na hora e para todos os avisos. O e-mail fica só para o importante (convite,
            consulta marcada, remarcada ou cancelada e o primeiro lembrete) quando o paciente não ligou o Telegram.
          </p>
        </div>
        {!overview ? (
          <Alert variant="destructive"><AlertDescription>Não foi possível carregar agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : (
          <NotificationSettingsView overview={overview} log={log ?? []} />
        )}
      </main>
    </div>
  );
}
