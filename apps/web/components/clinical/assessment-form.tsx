'use client';

import {
  ISAK_SUM8_SITES,
  PROTOCOL_SITES,
  NutritionInputError,
  bmi,
  bodyComposition,
  classifyBmi,
  isakSkinfoldSums,
  waistHeightRatio,
  waistHipRatio,
  waistRisk,
  type DensityEquation,
  type SkinfoldProtocol,
  type SkinfoldSite,
  type Skinfolds,
} from '@rafanutri/nutrition-core';
import { Info, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LineChart } from '@/components/charts/line-chart';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { demoHistory, demoPatient } from '@/lib/demo/patient';
import { cn } from '@/lib/utils';

type Protocol = SkinfoldProtocol | 'isak';

const PROTOCOLS: Array<{ value: Protocol; label: string }> = [
  { value: 'jp3', label: 'Jackson & Pollock 3 dobras' },
  { value: 'jp7', label: 'Jackson & Pollock 7 dobras' },
  { value: 'durnin_womersley', label: 'Durnin & Womersley' },
  { value: 'faulkner', label: 'Faulkner' },
  { value: 'isak', label: 'Perfil restrito ISAK (somatórios)' },
];

const SITE_LABELS: Record<SkinfoldSite, string> = {
  triceps: 'Tríceps', biceps: 'Bíceps', subscapular: 'Subescapular', suprailiac: 'Suprailíaca',
  iliac_crest: 'Crista ilíaca', supraspinale: 'Supraespinal', abdominal: 'Abdominal', chest: 'Peitoral',
  midaxillary: 'Axilar média', thigh: 'Coxa', calf: 'Panturrilha',
};

const BMI_LABELS: Record<ReturnType<typeof classifyBmi>, string> = {
  underweight: 'Baixo peso', normal: 'Eutrofia', overweight: 'Sobrepeso',
  obesity_1: 'Obesidade grau I', obesity_2: 'Obesidade grau II', obesity_3: 'Obesidade grau III',
};
const WAIST_LABELS: Record<ReturnType<typeof waistRisk>, string> = {
  low: 'Sem risco aumentado', increased: 'Risco aumentado', substantially_increased: 'Risco muito aumentado',
};

const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

function safe<T>(fn: () => T): { value: T | null; error: string | null } {
  try {
    return { value: fn(), error: null };
  } catch (e) {
    return { value: null, error: e instanceof NutritionInputError ? e.message : 'Valores inválidos.' };
  }
}

function Result({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'warn' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className={cn('mt-0.5 text-xs font-medium', tone === 'good' ? 'text-primary' : tone === 'warn' ? 'text-accent-foreground' : 'text-muted-foreground')}>{hint}</p>}
    </div>
  );
}

export function AssessmentForm() {
  const last = demoHistory[demoHistory.length - 1]!;
  const [weight, setWeight] = useState('67.6');
  const [height, setHeight] = useState(String(demoPatient.heightCm));
  const [waist, setWaist] = useState('78');
  const [hip, setHip] = useState('101');
  const [protocol, setProtocol] = useState<Protocol>('jp3');
  const [density, setDensity] = useState<DensityEquation>('siri');
  const [folds, setFolds] = useState<Record<string, string>>({ triceps: '20', suprailiac: '17', thigh: '27' });

  const sites: SkinfoldSite[] = protocol === 'isak' ? ISAK_SUM8_SITES : PROTOCOL_SITES[protocol][demoPatient.sex];
  const r = useMemo(() => {
    const skinfolds: Skinfolds = Object.fromEntries(
      sites.map((s) => [s, num(folds[s] ?? '')]).filter(([, v]) => Number.isFinite(v)),
    );
    const w = num(weight);
    const h = num(height);
    const wa = num(waist);
    const hi = num(hip);
    const imc = safe(() => bmi(w, h));
    const comp =
      protocol === 'isak'
        ? null
        : safe(() => bodyComposition({ protocol, sex: demoPatient.sex, ageYears: demoPatient.ageYears, weightKg: w, skinfolds, densityEquation: density }));
    const isak = protocol === 'isak' ? safe(() => isakSkinfoldSums(skinfolds)) : null;
    return {
      imc,
      bmiClass: imc.value ? BMI_LABELS[classifyBmi(imc.value, demoPatient.ageYears)] : null,
      waist: Number.isFinite(wa) ? safe(() => WAIST_LABELS[waistRisk(wa, demoPatient.sex)]) : null,
      whr: Number.isFinite(wa) && Number.isFinite(hi) ? safe(() => waistHipRatio(wa, hi)) : null,
      whtr: Number.isFinite(wa) && Number.isFinite(h) ? safe(() => waistHeightRatio(wa, h)) : null,
      comp,
      isak,
    };
  }, [weight, height, waist, hip, protocol, density, folds, sites]);

  const historyFat = demoHistory.map((a) =>
    bodyComposition({ protocol: 'jp3', sex: 'female', ageYears: demoPatient.ageYears, weightKg: a.weightKg, skinfolds: a.skinfolds }).bodyFatPct,
  );
  const weightPoints = [
    ...demoHistory.map((a) => ({ label: shortDate(a.date), value: a.weightKg })),
    ...(Number.isFinite(num(weight)) ? [{ label: 'Hoje', value: num(weight), highlight: true }] : []),
  ];
  const fatPoints = [
    ...demoHistory.map((a, i) => ({ label: shortDate(a.date), value: historyFat[i]! })),
    ...(protocol === 'jp3' && r.comp?.value ? [{ label: 'Hoje', value: r.comp.value.bodyFatPct, highlight: true }] : []),
  ];
  const weightChange = num(weight) - last.weightKg;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <form className="space-y-8" onSubmit={(e) => e.preventDefault()} aria-label="Nova avaliação antropométrica">
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold">Medidas</legend>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ['weight', 'Peso (kg)', weight, setWeight],
              ['height', 'Altura (cm)', height, setHeight],
              ['waist', 'Cintura (cm)', waist, setWaist],
              ['hip', 'Quadril (cm)', hip, setHip],
            ].map(([id, label, value, set]) => (
              <div key={id as string} className="space-y-2">
                <Label htmlFor={id as string}>{label as string}</Label>
                <Input id={id as string} inputMode="decimal" value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} className="h-11 tabular-nums" />
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
                <Input
                  id={`fold-${s}`}
                  inputMode="decimal"
                  value={folds[s] ?? ''}
                  onChange={(e) => setFolds((f) => ({ ...f, [s]: e.target.value }))}
                  className="h-11 tabular-nums"
                />
              </div>
            ))}
          </div>
          {protocol === 'isak' && <p className="text-xs text-muted-foreground">Informe a média das medidas de cada ponto (duplicata, ou mediana da triplicata).</p>}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled title="Pré-lançamento: a avaliação ainda não é salva">
            <Save className="size-4" /> Salvar avaliação
          </Button>
          <p className="text-xs text-muted-foreground">Pré-lançamento: os cálculos são reais, mas a avaliação ainda não é salva.</p>
        </div>
      </form>

      <aside className="space-y-4" aria-live="polite">
        <h2 className="text-lg font-semibold">Resultados</h2>
        {r.imc.error && <Alert variant="destructive"><AlertDescription>{r.imc.error}</AlertDescription></Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Result label="IMC" value={r.imc.value ? fmt(r.imc.value) : '—'} hint={r.bmiClass ?? undefined} tone={r.bmiClass === 'Eutrofia' ? 'good' : 'warn'} />
          <Result
            label="Variação de peso"
            value={Number.isFinite(weightChange) ? `${weightChange > 0 ? '+' : ''}${fmt(weightChange)} kg` : '—'}
            hint="desde a última avaliação"
            tone={weightChange <= 0 ? 'good' : 'warn'}
          />
          {r.comp?.value && (
            <>
              <Result label="Gordura corporal" value={`${fmt(r.comp.value.bodyFatPct)}%`} hint={`Soma das dobras: ${fmt(r.comp.value.skinfoldSum, 0)} mm`} />
              <Result label="Massa magra" value={`${fmt(r.comp.value.leanMassKg)} kg`} hint={`Massa gorda: ${fmt(r.comp.value.fatMassKg)} kg`} />
            </>
          )}
          {r.isak?.value && (
            <>
              <Result label="Σ 6 dobras (ISAK)" value={`${fmt(r.isak.value.sum6, 0)} mm`} hint="indicador principal de evolução" />
              <Result label="Σ 8 dobras (ISAK)" value={`${fmt(r.isak.value.sum8, 0)} mm`} />
            </>
          )}
          {r.whr?.value != null && <Result label="Relação cintura/quadril" value={fmt(r.whr.value, 2)} />}
          {r.whtr?.value != null && (
            <Result label="Relação cintura/estatura" value={fmt(r.whtr.value, 2)} hint={r.whtr.value >= 0.5 ? 'Acima de 0,5: atenção' : 'Abaixo de 0,5'} tone={r.whtr.value >= 0.5 ? 'warn' : 'good'} />
          )}
        </div>
        {r.waist?.value && <p className="text-sm"><span className="text-muted-foreground">Cintura: </span><span className="font-medium">{r.waist.value}</span></p>}
        {(r.comp?.error || r.isak?.error) && (
          <Alert><Info /><AlertDescription>{r.comp?.error ?? r.isak?.error}</AlertDescription></Alert>
        )}
        <LineChart title="Peso" unit="kg" points={weightPoints} />
        <LineChart title="Gordura corporal (Jackson & Pollock 3)" unit="%" points={fatPoints} />
      </aside>
    </div>
  );
}
