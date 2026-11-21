import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ContactPrefsPanel } from '@/components/notifications/contact-prefs';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getMyContactPrefs } from '@/lib/notifications/actions';
import { patientContextId } from '@/lib/patient-area/context';
import { getPatientArea } from '@/lib/patient-area/actions';

export const metadata: Metadata = { title: 'Avisos', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Onde o paciente recebe os avisos do consultório: Telegram (tudo) e e-mail (só o importante). */
export default async function PatientNotificationsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/avisos');
  const c = await patientContextId((await searchParams).c);
  const [area, prefs] = await Promise.all([getPatientArea(), getMyContactPrefs(c)]);
  if (area && !area.patient_account) redirect('/app');
  const record = area?.records.find((r) => r.patient_id === c) ?? area?.records[0] ?? null;
  const q = record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : '';

  return (
    <PatientShell practice={record?.practice ?? null} professional={record?.professional} canSwitch={(area?.records.length ?? 0) > 1}>
      <Link href={`/p${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Início
      </Link>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Avisos</h1>
      <p className="text-sm text-muted-foreground">Escolha onde receber os lembretes de consulta, as mudanças de horário e o aviso de plano novo{record ? ` de ${record.practice.name}` : ''}.</p>
      {prefs === null ? (
        <Alert variant="destructive"><AlertDescription>Não foi possível carregar os avisos agora. Atualize a página em instantes.</AlertDescription></Alert>
      ) : (
        <ContactPrefsPanel mode="patient" context={record?.patient_id ?? c} prefs={prefs} />
      )}
    </PatientShell>
  );
}
