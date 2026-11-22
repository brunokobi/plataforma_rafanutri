import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientHeader } from '@/components/patients/patient-record';
import { ScreeningForm } from '@/components/public-health/screening-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { getScreenings } from '@/lib/public-health/actions';
import { CLASSIFICATION_LABEL, TOOL_LABEL } from '@/lib/public-health/types';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { ageInYears, isUuid } from '@/lib/patients/schema';
import { RISK_LABEL } from '@rafanutri/nutrition-core';
import { pickClinicalOrg } from '@/lib/auth/clinical-org';

export const metadata: Metadata = { title: 'Triagens', robots: { index: false } };
export const dynamic = 'force-dynamic';

const RISK_VARIANT = { low: 'outline', medium: 'secondary', high: 'destructive' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default async function PatientScreeningsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/triagens`);
  if (!isUuid(id)) notFound();
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = pickClinicalOrg(organizations);

  const [patient, all, data, anamneses] = await Promise.all([getPatient(id), organization ? listPatients(organization.id) : null, getScreenings(id), listAnamneses(id)]);
  if (patient === undefined || data === undefined) notFound();
  const limit = getPlan(getUserPlan(organizations)).maxActivePatients;
  const activeLimitReached = limit !== null && (all ?? []).filter((p) => p.status === 'active').length >= limit;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        {patient === null || data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar a ficha agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : (
          <>
            <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="triagens" alerts={extractHealthAlerts(Array.isArray(anamneses) ? anamneses : [])} />
            {!data.allowed ? (
              <div className="space-y-2 rounded-lg border p-6">
                <h2 className="font-display text-xl font-semibold">Triagens nutricionais</h2>
                <p className="text-sm text-muted-foreground">NRS-2002, MUST e Avaliação Subjetiva Global fazem parte do módulo Saúde pública, habilitado por contrato.</p>
                <Link href="/app/configuracoes/plano" className="text-sm font-medium text-primary hover:underline">Ver planos</Link>
              </div>
            ) : (
              <>
                <ScreeningForm patientId={patient.id} ageYears={patient.birth_date ? ageInYears(patient.birth_date) : null} prefill={data.prefill} />
                <section aria-labelledby="history" className="space-y-3">
                  <h2 id="history" className="font-display text-xl font-semibold">Histórico</h2>
                  {data.screenings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma triagem registrada.</p>
                  ) : (
                    <ul aria-label="Triagens do paciente" className="divide-y rounded-lg border">
                      {data.screenings.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                          <span className="font-medium">{TOOL_LABEL[s.tool]}</span>
                          <span>{CLASSIFICATION_LABEL[s.classification] ?? s.classification}{s.score !== null ? ` · ${String(s.score).replace('.', ',')} pontos` : ''}</span>
                          <Badge variant={RISK_VARIANT[s.risk_level]}>{RISK_LABEL[s.risk_level]}</Badge>
                          <span className="ml-auto text-muted-foreground tabular-nums">{when(s.screened_at)}</span>
                          {s.notes && <p className="w-full text-muted-foreground">{s.notes}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">Referências: NRS-2002 (Kondrup et al., 2003), MUST (BAPEN, 2011) e ASG (Detsky et al., 1987). A MNA entra depois de validada a licença do formulário.</p>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
