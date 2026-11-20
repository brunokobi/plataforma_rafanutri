import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ContractAdmin } from '@/components/admin/contract-admin';
import { AppHeader } from '@/components/app/app-header';
import { adminOrg } from '@/lib/admin/actions';
import { getCurrentUser } from '@/lib/auth/session';
import { localToday } from '@/lib/uan/costs';

export const metadata: Metadata = { title: 'Contrato da empresa', robots: { index: false } };

export default async function AdminOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/admin/empresas/${id}`);
  const d = await adminOrg(id);
  if (!d) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        <div>
          <Link href="/app/admin" className="text-sm text-muted-foreground hover:underline">← Administração</Link>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{d.organization.name}</h1>
        </div>
        <ContractAdmin key={d.contracts.length + ':' + d.invoices.length} data={d} today={localToday()} />
      </main>
    </div>
  );
}
