import { ArrowLeft, FileDown, Utensils } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PatientPlanBody } from '@/components/patient-area/patient-plan-body';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { dateBR } from '@/lib/format/date';
import { getPatientArea, getPatientPlan } from '@/lib/patient-area/actions';
import { buildPatientPlanView } from '@/lib/patient-area/plan-view';

export const metadata: Metadata = { title: 'Meu plano alimentar', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** RN-205 — Plano publicado completo: refeições, alimentos com medidas caseiras, substituições, orientações e preparações. */
export default async function PatientPlanPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/plano');
  const { c } = await searchParams;
  const [area, payload] = await Promise.all([getPatientArea(), getPatientPlan(c)]);
  if (area && !area.patient_account) redirect('/app');
  const record = area?.records.find((r) => r.patient_id === (payload?.patient_id ?? c)) ?? area?.records[0] ?? null;
  const back = `/p${record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : ''}`;

  if (!payload) {
    return (
      <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
        <BackLink href={back} />
        <section className="rounded-2xl border border-dashed border-border p-6 text-center">
          <Utensils className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-3 font-semibold">Seu plano ainda não foi publicado</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assim que o plano alimentar for publicado, ele aparece aqui.</p>
        </section>
      </PatientShell>
    );
  }

  const plan = buildPatientPlanView(payload);
  return (
    <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
      <BackLink href={back} />
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{plan.title}</h1>
        <p className="text-sm text-muted-foreground">
          {plan.publishedAt ? `Publicado em ${dateBR(plan.publishedAt)}` : ''}
          {plan.validUntil ? ` · válido até ${dateBR(plan.validUntil)}` : ''}
        </p>
      </div>

      <a href={`/p/documentos/${payload.plan.id}/pdf${record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : ''}`} download
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
        <FileDown className="size-4" aria-hidden="true" /> Baixar PDF
      </a>

      <PatientPlanBody plan={plan} />
    </PatientShell>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> Início
    </Link>
  );
}
