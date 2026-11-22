import { AlertCircle, AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { FeedingChecklist } from '@/components/maternal/feeding-checklist';
import { FeedingGuide } from '@/components/maternal/feeding-guide';
import { LactationActions, OpenLactationForm } from '@/components/maternal/lactation-forms';
import { LineChart } from '@/components/maternal/line-chart';
import { EndPregnancyForm, MeasurementForm, OpenPregnancyForm } from '@/components/maternal/maternal-forms';
import { PatientHeader } from '@/components/patients/patient-record';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getMaternalData } from '@/lib/maternal/actions';
import { FEEDING_TYPE_LABEL, feedingChecklist, isSeriousReaction, monthsBetween, REACTION_LABEL, ALLERGENS } from '@/lib/maternal/feeding';
import { OUTCOME_LABEL, type FeedingRecord, type Lactation, type MaternalData } from '@/lib/maternal/types';
import { ageLabel, CHILD_MAX_DAYS, childView, CURVE_LABEL, pregnancyView, weeksLabel, type CurveIndicator } from '@/lib/maternal/view';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';
import { ageInDays } from '@rafanutri/nutrition-core/growth';
import { ENERGY_ADDITION_REFERENCE, GAIN_STATUS_LABEL, lactationEnergyAddition, pregnancyEnergyAddition } from '@rafanutri/nutrition-core';

export const metadata: Metadata = { title: 'Materno-infantil', robots: { index: false } };
export const dynamic = 'force-dynamic';

const LEVEL_TONE = { ok: 'text-primary', attention: 'text-amber-600 dark:text-amber-400', alert: 'text-destructive' } as const;
const STATUS_TONE = { adequate: 'text-primary', below: 'text-amber-600 dark:text-amber-400', above: 'text-amber-600 dark:text-amber-400' } as const;
const fmt = (n: number, d = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });
const dateBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const signed = (n: number) => `${n > 0 ? '+' : ''}${fmt(n, 2)}`;

export default async function MaternalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ curva?: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/materno-infantil`);
  if (!isUuid(id)) notFound();
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;

  const [patient, all, data, anamneses] = await Promise.all([getPatient(id), organization ? listPatients(organization.id) : null, getMaternalData(id), listAnamneses(id)]);
  if (patient === undefined || data === undefined) notFound();
  const alerts = extractHealthAlerts(anamneses);
  const limit = getPlan(getUserPlan(organizations)).maxActivePatients;
  const activeLimitReached = limit !== null && (all ?? []).filter((p) => p.status === 'active').length >= limit;
  const sp = await searchParams;
  const indicator: CurveIndicator = sp.curva === 'hfa' || sp.curva === 'bfa' ? sp.curva : 'wfa';
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        {patient === null || data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar a ficha agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : (
          <>
            <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="materno" alerts={alerts} />
            {!data.allowed ? (
              <div className="space-y-2 rounded-lg border p-6">
                <h2 className="font-display text-xl font-semibold">Materno-infantil</h2>
                <p className="text-sm text-muted-foreground">Curvas de crescimento da OMS, ganho de peso na gestação pelas curvas brasileiras, introdução alimentar e alertas de desvio fazem parte dos planos Profissional e Clínica.</p>
                <Link href="/app/configuracoes/plano" className="text-sm font-medium text-primary hover:underline">Ver planos</Link>
              </div>
            ) : (
              <MaternalContent patientId={patient.id} data={data} indicator={indicator} today={today} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function MaternalContent({ patientId, data, indicator, today }: { patientId: string; data: Extract<NonNullable<Awaited<ReturnType<typeof getMaternalData>>>, { allowed: true }>; indicator: CurveIndicator; today: string }) {
  const { sex, birth_date } = data.patient;
  const ageDays = birth_date ? ageInDays(birth_date, today) : null;
  const isChild = ageDays !== null && ageDays <= CHILD_MAX_DAYS;
  const canBePregnant = sex !== 'male' && (ageDays === null || ageDays >= 10 * 365);
  const lastHeight = [...data.measurements].reverse().find((m) => m.height_cm)?.height_cm ?? null;

  return (
    <div className="space-y-10">
      {isChild && (
        <section aria-labelledby="growth-title" className="space-y-4">
          <div className="space-y-1">
            <h2 id="growth-title" className="font-display text-2xl font-semibold">Crescimento</h2>
            <p className="text-sm text-muted-foreground">Idade: {ageLabel(ageDays)}. Curvas da OMS (0 a 5 anos: padrões de 2006; 5 a 19 anos: referência de 2007), classificação do Ministério da Saúde.</p>
          </div>
          {!sex ? (
            <Alert><AlertTriangle /><AlertDescription>Informe o sexo no cadastro do paciente para calcular as curvas.</AlertDescription></Alert>
          ) : (
            <ChildSection patientId={patientId} sex={sex} birthDate={birth_date!} data={data} indicator={indicator} ageDays={ageDays} />
          )}
          {ageDays < 730 && <FeedingGuide ageMonths={ageDays / 30.4375} />}
          {data.lactations.filter((l) => l.role === 'baby').map((l) => <BabyLactation key={l.id} l={l} />)}
          {ageDays >= 150 && ageDays < 1096 && <FeedingProgress patientId={patientId} records={data.feeding} ageMonths={ageDays / 30.4375} />}
        </section>
      )}
      {!isChild && !birth_date && (
        <Alert><AlertTriangle /><AlertDescription>Informe a data de nascimento no cadastro para usar as curvas de crescimento (crianças e adolescentes).</AlertDescription></Alert>
      )}
      {canBePregnant && <PregnancySection patientId={patientId} data={data} today={today} lastHeight={lastHeight} />}
      {canBePregnant && <LactationSection patientId={patientId} data={data} today={today} />}
      {!isChild && !canBePregnant && birth_date && (
        <p className="text-sm text-muted-foreground">Este módulo acompanha crianças e adolescentes (até 19 anos) e gestantes.</p>
      )}
    </div>
  );
}

function ChildSection({ patientId, sex, birthDate, data, indicator, ageDays }: { patientId: string; sex: 'female' | 'male'; birthDate: string; data: { measurements: import('@/lib/maternal/types').MaternalMeasurement[] }; indicator: CurveIndicator; ageDays: number }) {
  const view = childView(sex, birthDate, data.measurements, indicator);
  const tabs: CurveIndicator[] = ageDays > 3652 ? ['bfa', 'hfa'] : ['wfa', 'hfa', 'bfa'];
  return (
    <div className="space-y-4">
      {view.alerts.length > 0 && (
        <Alert variant={view.alerts.some((a) => a.level === 'alert') ? 'destructive' : 'default'}>
          <AlertTriangle />
          <AlertDescription>
            <ul className="space-y-1">{view.alerts.map((a) => <li key={`${a.date}-${a.indicator}-${a.message}`}>{dateBR(a.date)}: {a.message}</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}
      <nav aria-label="Curva" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t} href={`?curva=${t}`} aria-current={t === indicator ? 'page' : undefined} className={`rounded-full border px-3 py-1 text-sm ${t === indicator ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground'}`}>{CURVE_LABEL[t].title}</Link>
        ))}
      </nav>
      {view.chart ? (
        <LineChart
          title={`${CURVE_LABEL[view.chart.indicator].title} (OMS). Linhas: escore-z −3, −2, 0 (mediana), +2 e +3; pontos: medidas do paciente.`}
          xLabel={`Idade (${view.chart.xUnit})`}
          yLabel={CURVE_LABEL[view.chart.indicator].unit}
          xMin={view.chart.xUnit === 'anos' ? 5 : 0}
          xMax={view.chart.xMax}
          lines={view.chart.curves.map((c) => ({ points: c.points, label: c.z === 0 ? '0' : c.z > 0 ? `+${c.z}` : String(c.z), tone: c.z === 0 ? 'strong' : Math.abs(c.z) === 2 ? 'soft' : 'faint' }))}
          points={view.chart.points}
          pointLabel={([x, y]) => `${fmt(x)} ${view.chart!.xUnit}: ${fmt(y)} ${CURVE_LABEL[view.chart!.indicator].unit}`}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Ainda não há medidas para esta curva.</p>
      )}
      <MeasurementForm patientId={patientId} child under2={ageDays < 731} />
      {view.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Medidas e indicadores</caption>
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Idade</th><th className="px-3 py-2 font-medium">Indicadores (escore-z · classificação)</th></tr>
            </thead>
            <tbody className="divide-y">
              {view.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 tabular-nums">{dateBR(r.date)}</td>
                  <td className="px-3 py-2">{r.ageLabel}</td>
                  <td className="px-3 py-2">
                    <ul className="space-y-0.5">
                      {r.results.map((x) => (
                        <li key={x.indicator}>
                          {x.label}: <span className="tabular-nums">{signed(x.z)}</span> (P{fmt(x.percentile)}) · <span className={LEVEL_TONE[x.level]}>{x.classification}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PregnancySection({ patientId, data, today, lastHeight }: { patientId: string; data: { measurements: import('@/lib/maternal/types').MaternalMeasurement[]; pregnancies: import('@/lib/maternal/types').Pregnancy[] }; today: string; lastHeight: number | null }) {
  const active = data.pregnancies.find((p) => p.status === 'active');
  const past = data.pregnancies.filter((p) => p.status === 'ended');
  return (
    <section aria-labelledby="preg-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="preg-title" className="font-display text-2xl font-semibold">Gestação</h2>
        <p className="text-sm text-muted-foreground">Ganho de peso pelas curvas brasileiras (Kac et al., 2021), adotadas pelo Ministério da Saúde. Para adultas com gestação única de baixo risco; critério a validar pela nutricionista responsável.</p>
      </div>
      {active ? <PregnancyCard patientId={patientId} p={active} measurements={data.measurements} today={today} /> : <OpenPregnancyForm patientId={patientId} defaultHeight={lastHeight} />}
      {past.length > 0 && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">Gestações anteriores ({past.length})</summary>
          <div className="mt-4 space-y-6">{past.map((p) => <PregnancyCard key={p.id} patientId={patientId} p={p} measurements={data.measurements} today={today} />)}</div>
        </details>
      )}
    </section>
  );
}

function PregnancyCard({ patientId, p, measurements, today }: { patientId: string; p: import('@/lib/maternal/types').Pregnancy; measurements: import('@/lib/maternal/types').MaternalMeasurement[]; today: string }) {
  const v = pregnancyView(p, measurements, today);
  const ended = p.status === 'ended';
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Info label={ended ? 'Encerrada' : 'Idade gestacional'} value={ended ? `${dateBR(p.ended_on!)}${p.outcome ? ` · ${OUTCOME_LABEL[p.outcome]}` : ''}` : v.weeksNow !== null && v.weeksNow <= 44 ? weeksLabel(v.weeksNow) : '—'} />
        <Info label="Data provável do parto" value={dateBR(v.due)} />
        <Info label="IMC pré-gestacional" value={`${fmt(v.bmi)} · ${v.clsLabel}`} />
        <Info label="Ganho recomendado até 40 semanas" value={`${fmt(v.band.at(-1)!.min)} a ${fmt(v.band.at(-1)!.max)} kg`} />
      </div>
      {!ended && v.weeksNow !== null && v.weeksNow <= 44 && (
        <p className="text-sm">
          Adicional energético nesta fase: <strong>+{pregnancyEnergyAddition(v.weeksNow)} kcal/dia</strong>{' '}
          <span className="text-muted-foreground">({ENERGY_ADDITION_REFERENCE}; o editor de plano já sugere esse ajuste).</span>
        </p>
      )}
      {v.latest && (
        <Alert variant={v.latest.status === 'adequate' ? 'default' : 'destructive'}>
          {v.latest.status === 'adequate' ? <AlertCircle /> : <AlertTriangle />}
          <AlertDescription>
            Última pesagem ({weeksLabel(v.latest.weeks)}): ganho de {signed(v.latest.gainKg)} kg — <strong>{GAIN_STATUS_LABEL[v.latest.status].toLowerCase()}</strong> (faixa {fmt(v.latest.range.min)} a {fmt(v.latest.range.max)} kg nesta semana).
          </AlertDescription>
        </Alert>
      )}
      <LineChart
        title={`Ganho de peso gestacional (${v.clsLabel.toLowerCase()}): faixa recomendada em verde e pesagens da paciente.`}
        xLabel="Semanas de gestação"
        yLabel="kg ganhos"
        xMax={42}
        band={v.band.map((b) => ({ x: b.week, min: b.min, max: b.max }))}
        points={[...v.rows].reverse().map((r) => [r.assessment.weeks, r.assessment.gainKg])}
        pointLabel={([x, y]) => `${fmt(x)} semanas: ${signed(y)} kg`}
      />
      {!ended && <MeasurementForm patientId={patientId} child={false} under2={false} />}
      {v.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Pesagens da gestação</caption>
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Semanas</th><th className="px-3 py-2 text-right font-medium">Peso</th><th className="px-3 py-2 text-right font-medium">Ganho</th><th className="px-3 py-2 font-medium">Faixa</th><th className="px-3 py-2 font-medium">Situação</th></tr>
            </thead>
            <tbody className="divide-y">
              {v.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 tabular-nums">{dateBR(r.date)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt(r.assessment.weeks)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.weight)} kg</td>
                  <td className="px-3 py-2 text-right tabular-nums">{signed(r.assessment.gainKg)} kg</td>
                  <td className="px-3 py-2 tabular-nums">{fmt(r.assessment.range.min)} a {fmt(r.assessment.range.max)} kg</td>
                  <td className={`px-3 py-2 ${STATUS_TONE[r.assessment.status]}`}><Badge variant="outline">{GAIN_STATUS_LABEL[r.assessment.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!ended && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Suplementação (ácido fólico, ferro e outras) conforme prescrição do pré-natal.</li>
          <li>Modelos de plano &quot;Gestante&quot; na biblioteca de <Link href="/app/modelos-de-plano" className="text-primary hover:underline">Modelos de plano</Link>.</li>
        </ul>
      )}
      <EndPregnancyForm patientId={patientId} pregnancyId={p.id} active={!ended} />
    </div>
  );
}

type AllowedData = Extract<MaternalData, { allowed: true }>;
const dateOrDash = (iso: string | null) => (iso ? dateBR(iso) : '—');

/** RN-114 — Lactação da paciente: registro ativo (tipo, tempo pós-parto, adicional energético) e anteriores. */
function LactationSection({ patientId, data, today }: { patientId: string; data: AllowedData; today: string }) {
  const mine = data.lactations.filter((l) => l.role === 'mother');
  const active = mine.find((l) => l.status === 'active');
  const past = mine.filter((l) => l.status === 'ended');
  const lastBirth = data.pregnancies.find((p) => p.status === 'ended' && p.outcome === 'birth')?.ended_on ?? null;
  // Só oferece registrar quando há parto recente (até 2 anos) ou registro anterior
  const recentBirth = lastBirth !== null && monthsBetween(lastBirth, today) <= 24;
  if (!active && !recentBirth && mine.length === 0) return null;
  return (
    <section aria-labelledby="lact-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="lact-title" className="font-display text-2xl font-semibold">Lactação</h2>
        <p className="text-sm text-muted-foreground">Tipo de aleitamento conforme o Ministério da Saúde. O registro aparece também na ficha do bebê, se ele for paciente.</p>
      </div>
      {active ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Info label="Início" value={dateBR(active.started_on)} />
            <Info label="Pós-parto" value={`${fmt(Math.max(0, monthsBetween(active.started_on, today)), 1)} meses`} />
            <Info label="Bebê" value={active.baby_name ?? 'Não cadastrado'} />
          </div>
          <p className="text-sm">
            Adicional energético: <strong>+{lactationEnergyAddition(monthsBetween(active.started_on, today))} kcal/dia</strong>{' '}
            <span className="text-muted-foreground">({ENERGY_ADDITION_REFERENCE}, aleitamento exclusivo; reduza no aleitamento parcial).</span>
          </p>
          <LactationActions patientId={patientId} lactationId={active.id} active type={active.feeding_type} />
        </div>
      ) : (
        <OpenLactationForm patientId={patientId} defaultStart={lastBirth} babies={data.baby_candidates} />
      )}
      {past.length > 0 && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">Lactações anteriores ({past.length})</summary>
          <ul className="mt-3 space-y-3 text-sm">
            {past.map((l) => (
              <li key={l.id} className="space-y-1">
                <p>{dateBR(l.started_on)} a {dateOrDash(l.ended_on)} · {FEEDING_TYPE_LABEL[l.feeding_type]}{l.baby_name ? ` · ${l.baby_name}` : ''}</p>
                {!active && <LactationActions patientId={patientId} lactationId={l.id} active={false} type={l.feeding_type} />}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Na ficha do bebê: o aleitamento registrado na ficha da mãe. */
function BabyLactation({ l }: { l: Lactation }) {
  return (
    <div className="rounded-lg border p-4 text-sm">
      <p className="font-medium">Aleitamento</p>
      <p className="text-muted-foreground">
        {FEEDING_TYPE_LABEL[l.feeding_type]} desde {dateBR(l.started_on)}{l.status === 'ended' && l.ended_on ? `, até ${dateBR(l.ended_on)}` : ''} (registro na ficha de {l.mother_name}).
      </p>
    </div>
  );
}

/** RN-116 — Alergênicos e texturas, com destaque para as reações moderadas e graves. */
function FeedingProgress({ patientId, records, ageMonths }: { patientId: string; records: FeedingRecord[]; ageMonths: number }) {
  const serious = records.filter((r) => r.kind === 'allergen' && isSeriousReaction(r.reaction));
  const mode = { kind: 'pro' as const, patientId };
  return (
    <div className="space-y-4">
      {serious.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            {serious.map((r) => `${ALLERGENS.find((a) => a.code === r.item)?.label ?? r.item}: ${REACTION_LABEL[r.reaction].toLowerCase()} em ${dateBR(r.introduced_on)}${r.by_guardian ? ' (registrada pelo responsável)' : ''}`).join(' · ')}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <FeedingChecklist kind="allergen" title="Alergênicos" items={feedingChecklist('allergen', records, ageMonths)} mode={mode} />
        <FeedingChecklist kind="texture" title="Texturas" items={feedingChecklist('texture', records, ageMonths)} mode={mode} />
      </div>
      <p className="text-xs text-muted-foreground">Oferecer os alergênicos desde o início da introdução alimentar, um de cada vez, ajuda a identificar reações (Sociedade Brasileira de Pediatria e ASBAI). O responsável também registra pelo app quando o acompanhamento está liberado em &quot;O que o paciente vê&quot;.</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
