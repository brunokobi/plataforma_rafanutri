'use client';

import { bodyComposition, type DensityEquation, type Sex, type SkinfoldSite, type Skinfolds } from '@rafanutri/nutrition-core';
import { Info, Loader2, Save } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { LineChart } from '@/components/charts/line-chart';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PROTOCOLS, computeAssessment, protocolSites, type AssessmentInput, type Protocol } from '@/lib/assessments/compute';
import type { AssessmentInputData } from '@/lib/assessments/schema';
import { demoHistory, demoPatient } from '@/lib/demo/patient';
import { cn } from '@/lib/utils';

const SITE_LABELS: Record<SkinfoldSite, string> = {
  triceps: 'Tríceps', biceps: 'Bíceps', subscapular: 'Subescapular', suprailiac: 'Suprailíaca',
  iliac_crest: 'Crista ilíaca', supraspinale: 'Supraespinal', abdominal: 'Abdominal', chest: 'Peitoral',
  midaxillary: 'Axilar média', thigh: 'Coxa', calf: 'Panturrilha',
};

export const BMI_LABELS = {
  underweight: 'Baixo peso', normal: 'Eutrofia', overweight: 'Sobrepeso',
  obesity_1: 'Obesidade grau I', obesity_2: 'Obesidade grau II', obesity_3: 'Obesidade grau III',
} as const;
const WAIST_LABELS = { low: 'Sem risco aumentado', increased: 'Risco aumentado', substantially_increased: 'Risco muito aumentado' } as const;

const num = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : Number(v.replace(',', '.')));
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const todayISO = () => new Date().toISOString().slice(0, 10);

function Result({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'warn' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className={cn('mt-0.5 text-xs font-medium', tone === 'good' ? 'text-primary' : tone === 'warn' ? 'text-accent-foreground' : 'text-muted-foreground')}>{hint}</p>}
    </div>
  );
}

export interface HistoryPoint {
  label: string;
  weightKg: number | null;
  bodyFatPct: number | null;
}

export interface AssessmentFormProps {
  sex: Sex | null;
  ageYears: number | null;
  defaults?: { weight?: string; height?: string; waist?: string; hip?: string; protocol?: Protocol; folds?: Record<string, string> };
  /** Histórico em ordem cronológica (mais antiga primeiro). */
  history: HistoryPoint[];
  previousWeightKg: number | null;
  /** Ausente = só cálculo (botão desativado com `saveDisabledReason`). */
  onSave?: (input: AssessmentInputData) => Promise<{ ok: boolean; message?: string }>;
  saveDisabledReason?: string;
}

export function AssessmentForm({ sex, ageYears, defaults = {}, history, previousWeightKg, onSave, saveDisabledReason }: AssessmentFormProps) {
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState(defaults.weight ?? '');
  const [height, setHeight] = useState(defaults.height ?? '');
  const [waist, setWaist] = useState(defaults.waist ?? '');
  const [hip, setHip] = useState(defaults.hip ?? '');
  const [protocol, setProtocol] = useState<Protocol>(defaults.protocol ?? 'jp3');
  const [density, setDensity] = useState<DensityEquation>('siri');
  const [folds, setFolds] = useState<Record<string, string>>(defaults.folds ?? {});
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const sites = protocolSites(protocol, sex);
  const input: AssessmentInput = useMemo(() => {
    const skinfolds: Skinfolds = Object.fromEntries(
      sites.map((s) => [s, num(folds[s])]).filter((e): e is [SkinfoldSite, number] => e[1] !== null && Number.isFinite(e[1])),
    );
    return {
      assessed_at: date,
      weight_kg: num(weight),
      height_cm: num(height),
      waist_cm: num(waist),
      hip_cm: num(hip),
      protocol: Object.keys(skinfolds).length ? protocol : null,
      density_equation: density,
      skinfolds,
      notes: notes.trim() || null,
    };
  }, [date, weight, height, waist, hip, protocol, density, folds, sites, notes]);

  const { results: r, warnings } = useMemo(() => computeAssessment(input, { sex, ageYears }), [input, sex, ageYears]);
  const weightChange = input.weight_kg !== null && previousWeightKg !== null ? input.weight_kg - previousWeightKg : null;

  const weightPoints = [
    ...history.filter((h) => h.weightKg !== null).map((h) => ({ label: h.label, value: h.weightKg! })),
    ...(input.weight_kg !== null ? [{ label: 'Hoje', value: input.weight_kg, highlight: true }] : []),
  ];
  const fatPoints = [
    ...history.filter((h) => h.bodyFatPct !== null).map((h) => ({ label: h.label, value: h.bodyFatPct! })),
    ...(r.body_fat_pct !== undefined ? [{ label: 'Hoje', value: r.body_fat_pct, highlight: true }] : []),
  ];

  function save() {
    if (!onSave) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await onSave(input as AssessmentInputData);
      setFeedback(res.ok ? { kind: 'ok', text: 'Avaliação salva.' } : { kind: 'error', text: res.message ?? 'Não foi possível salvar.' });
    });
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); save(); }} aria-label="Nova avaliação antropométrica">
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold">Medidas</legend>
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="assessed_at">Data</Label>
              <Input id="assessed_at" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </div>
            {(
              [
                ['weight', 'Peso (kg)', weight, setWeight],
                ['height', 'Altura (cm)', height, setHeight],
                ['waist', 'Cintura (cm)', waist, setWaist],
                ['hip', 'Quadril (cm)', hip, setHip],
              ] as const
            ).map(([id, label, value, set]) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={id}>{label}</Label>
                <Input id={id} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} className="h-11 tabular-nums" />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold">Composição corporal</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="protocol">Protocolo</Label>
              <select id="protocol" value={protocol} onChange={(e) => setProtocol(e.target.value as Protocol)} className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30">
                {PROTOCOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Use sempre o mesmo protocolo para comparar as avaliações.</p>
            </div>
            {protocol !== 'faulkner' && protocol !== 'isak' && (
              <div className="space-y-2">
                <Label htmlFor="density">Equação de densidade → % de gordura</Label>
                <select id="density" value={density} onChange={(e) => setDensity(e.target.value as DensityEquation)} className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30">
                  <option value="siri">Siri (1961)</option>
                  <option value="brozek">Brozek (1963)</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {sites.map((s) => (
              <div key={s} className="space-y-2">
                <Label htmlFor={`fold-${s}`}>{SITE_LABELS[s]} (mm)</Label>
                <Input id={`fold-${s}`} inputMode="decimal" value={folds[s] ?? ''} onChange={(e) => setFolds((f) => ({ ...f, [s]: e.target.value }))} className="h-11 tabular-nums" />
              </div>
            ))}
          </div>
          {protocol === 'isak' && <p className="text-xs text-muted-foreground">Informe a média das medidas de cada ponto (duplicata, ou mediana da triplicata).</p>}
        </fieldset>

        {onSave && (
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} className="w-full rounded-md border border-input bg-transparent p-3 text-sm dark:bg-input/30" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!onSave || pending} title={!onSave ? saveDisabledReason : undefined}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar avaliação
          </Button>
          {!onSave && saveDisabledReason && <p className="text-xs text-muted-foreground">{saveDisabledReason}</p>}
          {feedback && (
            <p role="status" className={cn('text-sm', feedback.kind === 'ok' ? 'text-primary' : 'text-destructive')}>{feedback.text}</p>
          )}
        </div>
      </form>

      <aside className="space-y-4" aria-live="polite">
        <h2 className="text-lg font-semibold">Resultados</h2>
        <div className="grid grid-cols-2 gap-3">
          <Result
            label="IMC"
            value={r.bmi !== undefined ? fmt(r.bmi) : '—'}
            hint={r.bmi_class ? BMI_LABELS[r.bmi_class] : undefined}
            tone={r.bmi_class === 'normal' ? 'good' : 'warn'}
          />
          <Result
            label="Variação de peso"
            value={weightChange !== null ? `${weightChange > 0 ? '+' : ''}${fmt(weightChange)} kg` : '—'}
            hint={previousWeightKg !== null ? 'desde a última avaliação' : 'primeira avaliação'}
            tone={weightChange !== null && weightChange <= 0 ? 'good' : 'warn'}
          />
          {r.body_fat_pct !== undefined && (
            <>
              <Result label="Gordura corporal" value={`${fmt(r.body_fat_pct)}%`} hint={r.skinfold_sum !== undefined ? `Soma das dobras: ${fmt(r.skinfold_sum, 0)} mm` : undefined} />
              <Result label="Massa magra" value={`${fmt(r.lean_mass_kg ?? 0)} kg`} hint={`Massa gorda: ${fmt(r.fat_mass_kg ?? 0)} kg`} />
            </>
          )}
          {r.sum6 !== undefined && (
            <>
              <Result label="Σ 6 dobras (ISAK)" value={`${fmt(r.sum6, 0)} mm`} hint="indicador principal de evolução" />
              <Result label="Σ 8 dobras (ISAK)" value={`${fmt(r.sum8 ?? 0, 0)} mm`} />
            </>
          )}
          {r.whr !== undefined && <Result label="Relação cintura/quadril" value={fmt(r.whr, 2)} />}
          {r.whtr !== undefined && (
            // O alerta usa o mesmo valor arredondado que aparece na tela (evita "0,50 · abaixo de 0,5").
            <Result
              label="Relação cintura/estatura"
              value={fmt(r.whtr, 2)}
              hint={Math.round(r.whtr * 100) / 100 >= 0.5 ? 'A partir de 0,5: atenção' : 'Abaixo de 0,5'}
              tone={Math.round(r.whtr * 100) / 100 >= 0.5 ? 'warn' : 'good'}
            />
          )}
        </div>
        {r.waist_risk && <p className="text-sm"><span className="text-muted-foreground">Cintura: </span><span className="font-medium">{WAIST_LABELS[r.waist_risk]}</span></p>}
        {warnings.length > 0 && (
          <Alert><Info /><AlertDescription><p>{warnings[0]}</p></AlertDescription></Alert>
        )}
        {weightPoints.length > 1 && <LineChart title="Evolução do peso" unit="kg" points={weightPoints} />}
        {fatPoints.length > 1 && <LineChart title="Evolução da gordura corporal" unit="%" points={fatPoints} />}
      </aside>
    </div>
  );
}

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

/** Demonstração com a paciente fictícia (nada é salvo). */
export function DemoAssessmentForm() {
  const history = demoHistory.map((a) => ({
    label: shortDate(a.date),
    weightKg: a.weightKg,
    bodyFatPct: bodyComposition({ protocol: 'jp3', sex: demoPatient.sex, ageYears: demoPatient.ageYears, weightKg: a.weightKg, skinfolds: a.skinfolds }).bodyFatPct,
  }));
  return (
    <AssessmentForm
      sex={demoPatient.sex}
      ageYears={demoPatient.ageYears}
      defaults={{ weight: '67.6', height: String(demoPatient.heightCm), waist: '78', hip: '101', protocol: 'jp3', folds: { triceps: '20', suprailiac: '17', thigh: '27' } }}
      history={history}
      previousWeightKg={demoHistory[demoHistory.length - 1]!.weightKg}
      saveDisabledReason="Demonstração: os cálculos são reais, mas a avaliação não é salva."
    />
  );
}
