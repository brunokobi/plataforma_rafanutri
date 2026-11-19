import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { DossierSection, IntegritySection, LicensesSection, ManualSection } from '@/components/uan/legal-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { localToday } from '@/lib/uan/costs';
import { getExports, getIntegrity, getLicenses, getManual } from '@/lib/uan/legal-actions';

export const metadata: Metadata = { title: 'Fiscalização', robots: { index: false } };

export default async function LegalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}/fiscalizacao`);
  const today = localToday();
  const yearAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 365 * 86400e3).toISOString().slice(0, 10);
  const [licenses, manual, exports, integrity] = await Promise.all([getLicenses(id), getManual(id), getExports(id), getIntegrity(id, yearAgo, today)]);
  if (licenses === undefined || manual === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-6 sm:px-5 sm:py-10">
        {licenses === null || manual === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${id}`} className="text-sm text-muted-foreground hover:underline">← {licenses.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Fiscalização</h1>
              <p className="text-sm text-muted-foreground">Licenças, Manual de Boas Práticas, dossiê e integridade dos registros.</p>
            </div>
            <LicensesSection data={licenses} />
            <ManualSection data={manual} unitId={id} />
            {exports && <DossierSection unitId={id} today={today} exports={exports} />}
            {integrity && <IntegritySection report={integrity} />}
            {!manual.can_audit && <p className="text-sm text-muted-foreground">O dossiê e a verificação de integridade ficam com o responsável, o gestor, o RT e o auditor.</p>}
          </>
        )}
      </main>
    </div>
  );
}
