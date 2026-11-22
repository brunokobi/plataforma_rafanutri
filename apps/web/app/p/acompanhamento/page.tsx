import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FeedingChecklist } from '@/components/maternal/feeding-checklist';
import { FeedingGuide } from '@/components/maternal/feeding-guide';
import { LineChart } from '@/components/maternal/line-chart';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { getMyMaternal } from '@/lib/maternal/actions';
import { FEEDING_TYPE_LABEL, feedingChecklist, monthsBetween } from '@/lib/maternal/feeding';
import type { MyMaternal } from '@/lib/maternal/types';
import { ageLabel, CHILD_MAX_DAYS, childView, CURVE_LABEL, pregnancyView, weeksLabel, type CurveIndicator } from '@/lib/maternal/view';
import { getPatientArea } from '@/lib/patient-area/actions';
import { patientContextId, pickRecord } from '@/lib/patient-area/context';
import { ageInDays } from '@rafanutri/nutrition-core/growth';

export const metadata: Metadata = { title: 'Acompanhamento', robots: { index: false } };
export const dynamic = 'force-dynamic';

const fmt = (n: number, d = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });
const dateBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const TONE = { ok: 'text-primary', attention: 'text-amber-600 dark:text-amber-400', alert: 'text-destructive' } as const;
/** Gestação: frases simples para o app (sem termos técnicos). */
const GAIN_SIMPLE = { adequate: 'dentro do esperado', below: 'abaixo do esperado', above: 'acima do esperado' } as const;

/**
 * RN-117 — Acompanhamento materno-infantil no app: curvas da criança em linguagem simples (sem escore-z),
 * introdução alimentar com registro pelo responsável, gestação e lactação. Só o que o nutricionista liberou.
 */
export default async function MaternalAppPage({ searchParams }: { searchParams: Promise<{ c?: string; curva?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/acompanhamento');
  const sp = await searchParams;
  const area = await getPatientArea();
  if (area && !area.patient_account) redirect('/app');
  const records = area?.records ?? [];
  const { record, needsChoice } = pickRecord(records, await patientContextId(sp.c));
  if (needsChoice) redirect('/p/nutricionistas');
  if (!record) redirect('/p');
  const data = await getMyMaternal(record.patient_id);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const indicator: CurveIndicator = sp.curva === 'hfa' || sp.curva === 'bfa' ? sp.curva : 'wfa';
  const q = records.length > 1 ? `c=${record.patient_id}&` : '';

  return (
    <PatientShell practice={record.practice} professional={record.professional} canSwitch={records.length > 1}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Acompanhamento{record.first_name ? ` · ${record.first_name}` : ''}</h1>
      {data === null ? (
        <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar agora. Atualize a página em instantes.</AlertDescription></Alert>
      ) : !data.visible ? (
        <p className="text-muted-foreground">O acompanhamento ainda não foi liberado pelo seu nutricionista.</p>
      ) : (
        <Content data={data} today={today} indicator={indicator} recordId={record.patient_id} q={q} />
      )}
      <Link href={`/p${q ? `?${q.slice(0, -1)}` : ''}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">← Voltar ao início</Link>
    </PatientShell>
  );
}

function Content({ data, today, indicator, recordId, q }: { data: Extract<MyMaternal, { visible: true }>; today: string; indicator: CurveIndicator; recordId: string; q: string }) {
  const { patient } = data;
  const days = patient.birth_date ? ageInDays(patient.birth_date, today) : null;
  const isChild = days !== null && days <= CHILD_MAX_DAYS;
  const measurements = data.measurements.map((m, i) => ({ ...m, id: String(i), notes: null }));
  const sections: React.ReactNode[] = [];

  if (isChild && patient.sex) {
    const view = childView(patient.sex, patient.birth_date!, measurements, indicator);
    const latest = view.rows[0];
    const tabs: CurveIndicator[] = days > 3652 ? ['bfa', 'hfa'] : ['wfa', 'hfa', 'bfa'];
    sections.push(
      <section key="growth" aria-labelledby="growth" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 id="growth" className="font-display text-xl font-semibold">Crescimento</h2>
        <p className="text-sm text-muted-foreground">Idade: {ageLabel(days)}. Comparação com as curvas da Organização Mundial da Saúde.</p>
        {latest ? (
          <>
            <p className="text-sm">Última medida, em {dateBR(latest.date)}:</p>
            <ul className="space-y-1 text-sm">
              {latest.results.map((r) => <li key={r.indicator} className={TONE[r.level]}>{r.classification}</li>)}
            </ul>
          </>
        ) : <p className="text-sm text-muted-foreground">Ainda não há medidas registradas.</p>}
        <nav aria-label="Curva" className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link key={t} href={`?${q}curva=${t}`} aria-current={t === indicator ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${t === indicator ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground'}`}>{CURVE_LABEL[t].title}</Link>
          ))}
        </nav>
        {view.chart && (
          <LineChart
            title={`${CURVE_LABEL[view.chart.indicator].title}: a faixa entre as linhas de fora é a esperada; a do meio é a média. Os pontos são as medidas.`}
            xLabel={`Idade (${view.chart.xUnit})`}
            yLabel={CURVE_LABEL[view.chart.indicator].unit}
            xMin={view.chart.xUnit === 'anos' ? 5 : 0}
            xMax={view.chart.xMax}
            lines={view.chart.curves.filter((c) => Math.abs(c.z) !== 3).map((c) => ({ points: c.points, label: c.z === 0 ? 'média' : '', tone: c.z === 0 ? 'strong' : 'soft' }))}
            points={view.chart.points}
            pointLabel={([x, y]) => `${fmt(x)} ${view.chart!.xUnit}: ${fmt(y)} ${CURVE_LABEL[view.chart!.indicator].unit}`}
          />
        )}
        <p className="text-xs text-muted-foreground">Dúvidas sobre o resultado? Converse com o seu nutricionista na próxima consulta.</p>
      </section>,
    );
    if (days < 730) sections.push(<FeedingGuide key="guide" ageMonths={days / 30.4375} />);
    if (days >= 150 && days < 1096) {
      const months = days / 30.4375;
      const mode = { kind: 'app' as const, recordId };
      sections.push(
        <section key="feeding" aria-labelledby="feeding" className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 id="feeding" className="font-display text-xl font-semibold">Introdução alimentar</h2>
          <p className="text-sm text-muted-foreground">Marque quando oferecer cada alimento pela primeira vez e se houve alguma reação. Seu nutricionista acompanha por aqui.</p>
          <FeedingChecklist kind="allergen" title="Alimentos que podem causar alergia" items={feedingChecklist('allergen', data.feeding, months)} mode={mode} />
          <FeedingChecklist kind="texture" title="Consistência da comida" items={feedingChecklist('texture', data.feeding, months)} mode={mode} />
        </section>,
      );
    }
  }

  if (data.pregnancy) {
    const v = pregnancyView({ id: 'app', status: 'active', ended_on: null, outcome: null, notes: null, ...data.pregnancy }, measurements, today);
    sections.push(
      <section key="preg" aria-labelledby="preg" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 id="preg" className="font-display text-xl font-semibold">Gestação</h2>
        <p className="text-sm">{v.weeksNow !== null && v.weeksNow <= 44 ? `${weeksLabel(v.weeksNow)} de gestação. ` : ''}Data provável do parto: {dateBR(v.due)}.</p>
        {v.latest && <p className="text-sm">Na última pesagem ({weeksLabel(v.latest.weeks)}), o ganho de peso foi de {fmt(v.latest.gainKg)} kg: <strong>{GAIN_SIMPLE[v.latest.status]}</strong>.</p>}
        <LineChart
          title="Ganho de peso na gestação: a faixa verde é a esperada para você; os pontos são as suas pesagens."
          xLabel="Semanas de gestação"
          yLabel="kg ganhos"
          xMax={42}
          band={v.band.map((b) => ({ x: b.week, min: b.min, max: b.max }))}
          points={[...v.rows].reverse().map((r) => [r.assessment.weeks, r.assessment.gainKg])}
          pointLabel={([x, y]) => `${fmt(x)} semanas: ${fmt(y)} kg`}
        />
      </section>,
    );
  }

  if (data.lactation) {
    const m = Math.max(0, monthsBetween(data.lactation.started_on, today));
    sections.push(
      <section key="lact" aria-labelledby="lact" className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <h2 id="lact" className="font-display text-xl font-semibold">Amamentação</h2>
        <p className="text-sm">{FEEDING_TYPE_LABEL[data.lactation.feeding_type]}, desde {dateBR(data.lactation.started_on)} ({fmt(m, 0)} {Math.round(m) === 1 ? 'mês' : 'meses'}).</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Beba água ao longo do dia, principalmente durante as mamadas.</li>
          <li>Mantenha as refeições do seu plano: amamentar aumenta a necessidade de energia.</li>
          <li>Leite materno exclusivo até 6 meses e, com a comida, até 2 anos ou mais.</li>
        </ul>
      </section>,
    );
  }

  if (sections.length === 0) return <p className="text-muted-foreground">Ainda não há acompanhamento registrado para mostrar aqui.</p>;
  return <div className="space-y-4">{sections}</div>;
}
