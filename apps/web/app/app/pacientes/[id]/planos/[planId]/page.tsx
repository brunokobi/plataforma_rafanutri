import { AlertCircle, ArrowLeft, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientAlerts } from '@/components/patients/patient-alerts';
import { PlanEditorClient } from '@/components/patients/plan-editor-client';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { listAssessments } from '@/lib/assessments/repository';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getMyProfessionalProfile } from '@/lib/auth/profile';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { foodsByIdsRepo } from '@/lib/foods/repository';
import { getMaternalData } from '@/lib/maternal/actions';
import { monthsBetween } from '@/lib/maternal/feeding';
import type { MaternalData } from '@/lib/maternal/types';
import { getMealPlan } from '@/lib/meal-plans/repository';
import { ENERGY_ADDITION_REFERENCE, gestationalWeeks, lactationEnergyAddition, pregnancyEnergyAddition } from '@rafanutri/nutrition-core';
import { STATUS_LABEL, planFoodIds } from '@/lib/meal-plans/schema';
import { getPatient } from '@/lib/patients/repository';
import { ageInYears, isUuid } from '@/lib/patients/schema';
import { pickClinicalOrg } from '@/lib/auth/clinical-org';

export const metadata: Metadata = { title: 'Plano alimentar', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** RN-113 — Adicional da gestação ativa ou da lactação ativa (a paciente como mãe). */
function energyAdditionOf(data: MaternalData | null | undefined) {
  if (!data?.allowed) return null;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const preg = data.pregnancies.find((p) => p.status === 'active');
  if (preg) {
    const w = gestationalWeeks(preg.lmp_date, today);
    if (w <= 44) return { kcal: pregnancyEnergyAddition(w), label: `Gestante, ${Math.floor(w)} semanas`, reference: ENERGY_ADDITION_REFERENCE };
  }
  const lac = data.lactations.find((l) => l.role === 'mother' && l.status === 'active');
  if (lac) {
    const m = monthsBetween(lac.started_on, today);
    return { kcal: lactationEnergyAddition(m), label: `Lactante, ${Math.floor(Math.max(0, m))} meses pós-parto`, reference: ENERGY_ADDITION_REFERENCE };
  }
  return null;
}

const slug = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default async function PatientPlanPage({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/planos/${encodeURIComponent(planId)}`);
  if (!isUuid(id) || !isUuid(planId)) notFound();

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = pickClinicalOrg(organizations);

  const [patient, plan, assessments, profile, anamneses] = await Promise.all([getPatient(id), getMealPlan(id, planId), listAssessments(id), getMyProfessionalProfile(user.id), listAnamneses(id)]);
  if (patient === undefined || plan === undefined) notFound();

  const failed = patient === null || plan === null || plan === 'unavailable';
  const foods = !failed ? await foodsByIdsRepo(planFoodIds(plan.meals)) : null;
  const lastWithWeight = Array.isArray(assessments) ? assessments.find((a) => a.weight_kg !== null) : undefined;
  const lastWithHeight = Array.isArray(assessments) ? assessments.find((a) => a.height_cm !== null) : undefined;
  const maternal = !failed && patient.sex !== 'male' ? await getMaternalData(patient.id) : null;
  const addition = energyAdditionOf(maternal);
  const fresh = !failed && plan.status === 'draft' && plan.meals.every((m) => m.items.length === 0) && (plan.targets?.adjustment ?? 0) === 0;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        <Link href={`/app/pacientes/${id}/planos`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar aos planos {patient ? `de ${patient.full_name}` : ''}
        </Link>
        {failed || foods === null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>Não foi possível carregar o plano agora. Atualize a página em instantes.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-semibold tracking-tight">{plan.title}</h1>
              <Badge variant={plan.status === 'published' ? 'default' : 'secondary'}>{STATUS_LABEL[plan.status]}</Badge>
            </div>
            <PatientAlerts alerts={extractHealthAlerts(anamneses)} patientId={patient.id} />
            <PlanEditorClient
              // Sem date_updated na chave: salvar o rascunho revalida a página, e remontar o editor apagaria
              // a confirmação "Rascunho salvo." (o conteúdo local já é o que foi salvo).
              key={`${plan.id}-${plan.status}`}
              patientId={patient.id}
              planId={plan.id}
              editable={plan.status === 'draft'}
              initialPlan={plan.meals}
              initialFoods={foods}
              initialTitle={plan.title}
              initialMode={plan.mode}
              initialTargets={plan.targets}
              initialGuidelines={plan.guidelines}
              patient={{
                name: patient.full_name,
                objective: patient.objective,
                sex: patient.sex,
                ageYears: patient.birth_date ? ageInYears(patient.birth_date) : null,
                weightKg: lastWithWeight?.weight_kg ?? null,
                heightCm: lastWithHeight?.height_cm ?? null,
                phone: patient.phone,
              }}
              shareable={plan.status === 'published'}
              energyAddition={addition ? { ...addition, prefill: fresh && addition.kcal > 0 } : null}
              practice={{
                practiceName: organization?.name ?? 'Consultório',
                professionalName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
                crn: profile?.crn ?? '',
                crnRegion: profile?.crn_region ?? 'CRN',
                color: organization?.brand_color ?? '#2E7D32',
                contact: user.email,
              }}
              pdfFileName={`plano-alimentar-${slug(patient.full_name)}.pdf`}
              banner={
                plan.status === 'draft' ? (
                  <Alert>
                    <Info />
                    <AlertTitle>Rascunho</AlertTitle>
                    <AlertDescription>
                      <p>Alimentos da TACO 4ª edição. Salve o rascunho quando quiser; ao publicar, o plano fica disponível para o paciente e não pode mais ser editado.</p>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <Info />
                    <AlertTitle>{plan.status === 'published' ? 'Plano publicado' : 'Plano arquivado'}</AlertTitle>
                    <AlertDescription>
                      <p>Este plano não pode mais ser editado. Para mudar algo, volte aos planos e use “Nova versão”. O PDF continua disponível.</p>
                    </AlertDescription>
                  </Alert>
                )
              }
            />
          </>
        )}
      </main>
    </div>
  );
}
