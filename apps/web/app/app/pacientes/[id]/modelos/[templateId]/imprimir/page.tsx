import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PlanSuggestionApply } from '@/components/meal-plans/plan-suggestion-apply';
import { PrintButton } from '@/components/meal-plans/print-button';
import { getMyOrganizations } from '@/lib/auth/organizations';
import { getMyProfessionalProfile } from '@/lib/auth/profile';
import { getCurrentUser } from '@/lib/auth/session';
import { pickClinicalOrg } from '@/lib/auth/clinical-org';
import { foodsByIdsRepo } from '@/lib/foods/repository';
import { dateBR, todaySP } from '@/lib/format/date';
import { planFoodIds } from '@/lib/meal-plans/schema';
import { scaleFactor, scaleMeals } from '@/lib/meal-plans/scale';
import { getPlanTemplate } from '@/lib/meal-plans/templates';
import { amountText } from '@/lib/patient-area/plan-view';
import { getPatient } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Imprimir plano sugerido', robots: { index: false } };

const HEX = /^#[0-9a-f]{6}$/i;

/** Modelo sugerido pronto para imprimir: ajustado à meta, com a marca do consultório, sem salvar nada. */
export default async function PrintTemplatePage({ params, searchParams }: { params: Promise<{ id: string; templateId: string }>; searchParams: Promise<{ kcal?: string }> }) {
  const { id, templateId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}`);
  if (!isUuid(id) || !isUuid(templateId)) notFound();
  const [patient, template, organizations, profile] = await Promise.all([getPatient(id), getPlanTemplate(templateId), getMyOrganizations(), getMyProfessionalProfile(user.id)]);
  if (!patient || !template) notFound();

  const qualitative = template.mode === 'qualitative';
  const wanted = Number((await searchParams).kcal);
  const target = !qualitative && Number.isFinite(wanted) && wanted >= 600 && wanted <= 6000 ? Math.round(wanted) : null;
  const factor = target ? scaleFactor(template.energy_kcal, target) : null;
  const meals = factor ? scaleMeals(template.meals, factor) : template.meals;
  const foods = new Map((await foodsByIdsRepo(planFoodIds(meals)) ?? []).map((f) => [f.id, f]));
  const org = pickClinicalOrg(organizations);
  const color = org?.brand_color && HEX.test(org.brand_color) ? org.brand_color : '#2E7D32';
  const professional = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
  const energy = qualitative ? null : Math.round(meals.reduce((t, m) => t + m.items.reduce((s, i) => s + ((foods.get(i.foodId)?.per100g.energy_kcal ?? 0) * i.quantityG) / 100, 0), 0));
  const amount = (foodId: string, g: number) => (qualitative ? '' : amountText(g, foods.get(foodId)?.householdMeasures ?? []));
  const guidelines = (template.guidelines ?? '').split('\n').map((l) => l.replace(/^•\s*/, '').trim())
    .filter((l) => l && !/^Modelo base da biblioteca|^As quantidades são do alimento/.test(l));

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 pt-6 print:hidden">
        <Link href={`/app/pacientes/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"><ArrowLeft className="size-4" /> Voltar à ficha</Link>
        <div className="flex flex-wrap gap-2">
          <PlanSuggestionApply patientId={id} templateId={templateId} targetKcal={target} />
          <PrintButton />
        </div>
      </div>
      <p className="mx-auto max-w-3xl px-5 pt-3 text-xs text-muted-foreground print:hidden">
        Pré-visualização do modelo {target ? `ajustado a ${target.toLocaleString('pt-BR')} kcal ` : ''}para {patient.full_name}. Nada é salvo: para editar e publicar na área do paciente, use “Criar plano”.
      </p>

      <article className="mx-auto max-w-3xl space-y-6 px-5 py-8 text-[15px] text-foreground print:max-w-none print:px-0 print:py-0 print:text-black">
        <header className="flex items-end justify-between gap-4 border-b-4 pb-3" style={{ borderColor: color }}>
          <div>
            <p className="text-sm font-semibold" style={{ color }}>{org?.name ?? 'Consultório'}</p>
            <h1 className="font-display text-2xl font-semibold">Plano alimentar</h1>
            <p className="text-sm">{patient.full_name}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground print:text-neutral-600">
            <p>{professional}{profile?.crn ? ` · ${profile.crn_region ?? 'CRN'} ${profile.crn}` : ''}</p>
            <p>{dateBR(todaySP())}</p>
            {energy ? <p>Cerca de {energy.toLocaleString('pt-BR')} kcal por dia</p> : null}
          </div>
        </header>

        {meals.map((m) => (
          <section key={m.id} className="break-inside-avoid space-y-2">
            <h2 className="flex items-baseline gap-2 text-lg font-semibold" style={{ color }}>{m.name}<span className="text-sm font-normal text-muted-foreground print:text-neutral-600">{m.time}</span></h2>
            <ul className="divide-y rounded-lg border print:border-neutral-300">
              {m.items.map((i) => {
                const f = foods.get(i.foodId);
                if (!f) return null;
                const subs = (i.subs ?? []).map((s) => {
                  const sf = foods.get(s.foodId);
                  if (!sf) return null;
                  const a = amount(s.foodId, s.quantityG);
                  return a ? `${sf.name} — ${a}` : sf.name;
                }).filter(Boolean);
                return (
                  <li key={i.key} className="px-3 py-2">
                    <div className="flex flex-wrap justify-between gap-x-4"><span className="font-medium">{f.name}</span><span className="text-muted-foreground print:text-neutral-700">{amount(i.foodId, i.quantityG)}</span></div>
                    {subs.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground print:text-neutral-600">Pode trocar por: {subs.join('; ')}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {guidelines.length > 0 && (
          <section className="break-inside-avoid space-y-2">
            <h2 className="text-lg font-semibold" style={{ color }}>Orientações</h2>
            <ul className="list-disc space-y-1 pl-5">{guidelines.map((g) => <li key={g}>{g}</li>)}</ul>
          </section>
        )}
        <footer className="border-t pt-3 text-xs text-muted-foreground print:text-neutral-600">
          {professional}{profile?.crn ? ` · ${profile.crn_region ?? 'CRN'} ${profile.crn}` : ''} · {org?.name ?? ''}
        </footer>
      </article>
    </div>
  );
}
