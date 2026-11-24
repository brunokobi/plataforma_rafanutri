import { anamnesisSignalText } from '@/lib/anamneses/alerts';
import type { Anamnesis } from '@/lib/anamneses/repository';
import type { Assessment } from '@/lib/assessments/schema';
import { getMaternalData } from '@/lib/maternal/actions';
import type { MealPlanSummary } from './schema';
import { suggestTemplates, type EnergyTarget, type Suggestion } from './suggest';
import { listPlanTemplateSummaries } from './templates';
import { ageInYears, type Patient } from '@/lib/patients/schema';

export interface PatientSuggestions { suggestions: Suggestion[]; target: EnergyTarget | null }

const weeksSince = (iso: string) => (Date.now() - Date.parse(`${iso}T12:00:00Z`)) / (7 * 864e5);

/** Reúne os sinais do paciente e devolve as sugestões de modelo (null se os modelos não carregarem). */
export async function patientSuggestions(patient: Patient, ctx: {
  assessments: Assessment[] | null | 'unavailable';
  anamneses: Anamnesis[] | null;
  plans: MealPlanSummary[] | null | 'unavailable';
}): Promise<PatientSuggestions | null> {
  const [templates, maternal] = await Promise.all([
    listPlanTemplateSummaries(),
    patient.sex === 'female' || patient.care_profile === 'maternal' ? getMaternalData(patient.id).catch(() => null) : Promise.resolve(null),
  ]);
  if (!Array.isArray(templates)) return null;
  const assessments = Array.isArray(ctx.assessments) ? ctx.assessments : [];
  const plans = Array.isArray(ctx.plans) ? ctx.plans : [];
  const pregnancy = maternal && maternal.allowed ? maternal.pregnancies.find((p) => p.status === 'active') : undefined;
  const lactation = maternal && maternal.allowed ? maternal.lactations.find((l) => l.status === 'active') : undefined;
  const published = plans.find((p) => p.status === 'published');
  return suggestTemplates(
    templates.map((t) => ({ id: t.id, name: t.name, tags: t.tags, mode: t.mode, energy_kcal: t.energy_kcal === null ? null : Number(t.energy_kcal), own: t.organization_id !== null })),
    {
      ageYears: patient.birth_date ? ageInYears(patient.birth_date) : null,
      sex: patient.sex,
      careProfile: patient.care_profile ?? null,
      objective: patient.objective,
      anamnesisText: anamnesisSignalText(Array.isArray(ctx.anamneses) ? ctx.anamneses : []),
      pregnancyWeeks: pregnancy ? weeksSince(pregnancy.lmp_date) : null,
      lactationMonths: lactation ? Math.max(0, weeksSince(lactation.started_on) / 4.345) : null,
      weightKg: assessments.find((a) => a.weight_kg)?.weight_kg ?? null,
      heightCm: assessments.find((a) => a.height_cm)?.height_cm ?? null,
      planKcal: published?.mode === 'quantitative' ? (published.totals?.energy_kcal ?? null) : null,
    },
  );
}
