import { AlertCircle, ArrowLeft, Utensils } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientPlanBody } from '@/components/patient-area/patient-plan-body';
import { WeightChart } from '@/components/patient-area/weight-chart';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPatientPreview } from '@/lib/patient-area/actions';
import { buildPatientPlanView } from '@/lib/patient-area/plan-view';
import { SHARE_LABEL, type ShareSettings } from '@/lib/patient-area/types';
import { getPatient } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Ver como paciente', robots: { index: false } };

/** RN-210 — Pré-visualização: o plano e o peso exatamente como o paciente vê, com as configurações atuais. */
export default async function PreviewAsPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/ver-como-paciente`);
  if (!isUuid(id)) notFound();
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);
  const [patient, preview] = await Promise.all([getPatient(id), getPatientPreview(id)]);
  if (patient === undefined) notFound();
  const firstName = patient?.full_name.split(/\s+/)[0] ?? 'Paciente';
  const plan = preview?.plan ? buildPatientPlanView(preview.plan) : null;
  const shown = preview ? (Object.keys(SHARE_LABEL) as Array<keyof ShareSettings>).filter((k) => preview.share[k]).map((k) => SHARE_LABEL[k].split(' (')[0]!.toLowerCase()) : [];

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
        <Link href={`/app/pacientes/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Voltar à ficha</Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Ver como paciente</h1>
          <p className="mt-1 text-muted-foreground">
            É assim que {firstName} vê o plano na área do paciente. {shown.length ? `Liberado: ${shown.join(', ')}.` : 'Calorias, macros e histórico de peso estão escondidos.'}
          </p>
        </div>
        {preview === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível montar a pré-visualização agora.</AlertDescription></Alert>
        ) : (
          <div aria-label="Pré-visualização da área do paciente" role="region" className="mx-auto w-full max-w-sm space-y-6 rounded-[2rem] border-8 border-foreground/80 bg-background px-4 py-6 shadow-xl">
            {preview.share.show_weight_history && <WeightChart data={preview.weight} />}
            {preview.share.show_weight_history && preview.weight.length === 0 && <p className="text-sm text-muted-foreground">Sem pesagens ainda: o gráfico aparece depois da primeira avaliação com peso.</p>}
            {plan ? (
              <>
                <h2 className="font-display text-2xl font-semibold tracking-tight">{plan.title}</h2>
                <PatientPlanBody plan={plan} />
              </>
            ) : (
              <section className="rounded-2xl border border-dashed border-border p-6 text-center">
                <Utensils className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 font-semibold">Seu plano ainda não foi publicado</p>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
