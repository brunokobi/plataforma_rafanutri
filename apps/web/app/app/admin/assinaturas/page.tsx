import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { AccountTelegram } from '@/components/billing/account-telegram';
import { AdminBillingView } from '@/components/billing/admin-billing';
import { getCurrentUser } from '@/lib/auth/session';
import { getAdminBilling, getMyAccountNotifications } from '@/lib/billing/actions';

export const metadata: Metadata = { title: 'Assinaturas', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Administração da assinatura por Pix. Só admin da plataforma (o endpoint devolve 404 para os outros). */
export default async function AdminSubscriptionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/admin/assinaturas');
  const [data, mine] = await Promise.all([getAdminBilling(), getMyAccountNotifications()]);
  if (!data) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        <Link href="/app/admin" className="text-sm text-muted-foreground hover:text-foreground">← Administração</Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Assinaturas</h1>
          <p className="text-sm text-muted-foreground">Planos pagos por Pix: o consultório paga e avisa; você confere no extrato e confirma.</p>
        </div>
        <AdminBillingView data={data} />
        {mine && <AccountTelegram prefs={mine} title="Seus avisos de administrador" description="Aviso de Pix informado pelos consultórios." />}
      </main>
    </div>
  );
}
