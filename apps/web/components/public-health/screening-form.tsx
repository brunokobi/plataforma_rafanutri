'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveScreening } from '@/lib/public-health/actions';
import type { ScreeningPrefill } from '@/lib/public-health/types';
import {
  must, mustSteps, NRS_SEVERITY_OPTIONS, NRS_STATUS_OPTIONS, nrs2002, nrsNeedsFinal, RISK_LABEL, sga, SGA_CLASS_LABEL, sgaSuggestion,
  type MustAnswers, type Nrs2002Answers, type ScreeningCode, type ScreeningResult, type SgaAnswers, type SgaClass,
} from '@rafanutri/nutrition-core';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30';
const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.replace(',', '.')));
const fmt = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '' : String(n).replace('.', ','));
const RISK_TONE = { low: 'border-primary/40 bg-primary/5', medium: 'border-amber-500/50 bg-amber-500/10', high: 'border-destructive/50 bg-destructive/10' } as const;

const TOOLS: Array<{ code: ScreeningCode; name: string; hint: string }> = [
  { code: 'must', name: 'MUST', hint: must.population },
  { code: 'nrs_2002', name: 'NRS-2002', hint: nrs2002.population },
  { code: 'sga', name: 'ASG', hint: sga.population },
];

/** RN-170 a RN-174 — Formulário guiado das triagens, com o resultado calculado na hora. */
export function ScreeningForm({ patientId, ageYears, prefill }: { patientId: string; ageYears: number | null; prefill: ScreeningPrefill }) {
  const [tool, setTool] = useState<ScreeningCode>('must');
  return (
    <section aria-labelledby="new-screening" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 id="new-screening" className="font-display text-xl font-semibold">Nova triagem</h2>
      <div role="radiogroup" aria-label="Ferramenta" className="flex flex-wrap gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.code} type="button" role="radio" aria-checked={tool === t.code} onClick={() => setTool(t.code)}
            className={`min-h-11 rounded-xl border px-4 py-2 text-left text-sm ${tool === t.code ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            <span className="block font-semibold">{t.name}</span>
            <span className="block text-xs">{t.hint}</span>
          </button>
        ))}
      </div>
      {prefill.weight_kg !== null && (
        <p className="text-xs text-muted-foreground">
          Dados da última avaliação{prefill.weighed_on ? ` (${prefill.weighed_on.split('-').reverse().join('/')})` : ''}: {fmt(prefill.weight_kg)} kg{prefill.bmi ? `, IMC ${fmt(prefill.bmi)}` : ''}. Confira antes de salvar.
        </p>
      )}
      {tool === 'must' && <MustForm key="must" patientId={patientId} prefill={prefill} />}
      {tool === 'nrs_2002' && <NrsForm key="nrs" patientId={patientId} prefill={prefill} ageYears={ageYears} />}
      {tool === 'sga' && <SgaForm key="sga" patientId={patientId} prefill={prefill} />}
    </section>
  );
}

function useSave(patientId: string, tool: ScreeningCode) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState('');
  const save = (answers: Record<string, unknown>, onDone?: () => void) =>
    start(async () => {
      setMessage(null);
      const r = await saveScreening(patientId, tool, answers, notes.trim() || null);
      if (!r.ok) return setMessage({ ok: false, text: r.message });
      setMessage({ ok: true, text: 'Triagem registrada.' });
      setNotes('');
      onDone?.();
      router.refresh();
    });
  return { pending, message, notes, setNotes, save };
}

function Footer({ result, errors, s, onSave }: { result: ScreeningResult | null; errors: Record<string, string>; s: ReturnType<typeof useSave>; onSave: () => void }) {
  const firstError = Object.values(errors)[0];
  return (
    <div className="space-y-3">
      {result && !firstError ? (
        <div role="status" aria-label="Resultado" className={`rounded-xl border p-3 ${RISK_TONE[result.risk]}`}>
          <p className="font-semibold">{result.label}{result.score !== null ? ` · ${String(result.score).replace('.', ',')} pontos` : ''} · {RISK_LABEL[result.risk]}</p>
          <p className="text-sm">{result.conduct}</p>
        </div>
      ) : firstError ? <p className="text-sm text-muted-foreground">{firstError}</p> : null}
      <div className="space-y-1">
        <Label htmlFor="sc-notes">Observação (opcional)</Label>
        <Input id="sc-notes" value={s.notes} maxLength={1000} onChange={(e) => s.setNotes(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={s.pending || Boolean(firstError)} onClick={onSave}>{s.pending && <Loader2 className="size-4 animate-spin" />}Salvar triagem</Button>
        {s.message && <p role={s.message.ok ? 'status' : 'alert'} className={`text-sm ${s.message.ok ? 'text-primary' : 'text-destructive'}`}>{s.message.text}</p>}
      </div>
    </div>
  );
}

function YesNo({ id, label, value, onChange }: { id: string; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm">
      <input id={id} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="size-4" />
      {label}
    </label>
  );
}

function MustForm({ patientId, prefill }: { patientId: string; prefill: ScreeningPrefill }) {
  const s = useSave(patientId, 'must');
  const [bmi, setBmi] = useState(fmt(prefill.bmi));
  const [loss, setLoss] = useState(fmt(prefill.loss_3_6m ?? 0));
  const [acute, setAcute] = useState(false);
  const answers: MustAnswers = { bmi: num(bmi), weightLossPct: num(loss), acuteDiseaseNoIntake: acute };
  const errors = must.validate(answers);
  const result = Object.keys(errors).length ? null : must.evaluate(answers);
  const steps = Object.keys(errors).length ? null : mustSteps(answers);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="must-bmi">Passo 1 — IMC (kg/m²)</Label>
          <Input id="must-bmi" inputMode="decimal" value={bmi} onChange={(e) => setBmi(e.target.value)} />
          {steps && <p className="text-xs text-muted-foreground">{steps.bmi} ponto(s)</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="must-loss">Passo 2 — Perda de peso não intencional em 3 a 6 meses (%)</Label>
          <Input id="must-loss" inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} />
          {steps && <p className="text-xs text-muted-foreground">{steps.loss} ponto(s){prefill.loss_3_6m !== null ? ' · calculada pelas avaliações' : ''}</p>}
        </div>
      </div>
      <YesNo id="must-acute" label="Passo 3 — Doença aguda com ausência (ou provável ausência) de ingestão por mais de 5 dias" value={acute} onChange={setAcute} />
      <Footer result={result} errors={errors} s={s} onSave={() => s.save(answers as unknown as Record<string, unknown>)} />
    </div>
  );
}

function NrsForm({ patientId, prefill, ageYears }: { patientId: string; prefill: ScreeningPrefill; ageYears: number | null }) {
  const s = useSave(patientId, 'nrs_2002');
  const [age, setAge] = useState(ageYears !== null ? String(ageYears) : '');
  const [bmiLow, setBmiLow] = useState(prefill.bmi !== null && prefill.bmi < 20.5);
  const [lost, setLost] = useState((prefill.loss_3m ?? 0) > 0);
  const [intake, setIntake] = useState(false);
  const [ill, setIll] = useState(false);
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const answers: Nrs2002Answers = {
    bmiBelow20_5: bmiLow, weightLoss3m: lost, reducedIntakeLastWeek: intake, severelyIll: ill, ageYears: num(age),
    ...(status !== '' ? { nutritionalStatus: Number(status) as 0 } : {}),
    ...(severity !== '' ? { diseaseSeverity: Number(severity) as 0 } : {}),
  };
  const final = nrsNeedsFinal(answers);
  const errors = nrs2002.validate(answers);
  const result = Object.keys(errors).length ? null : nrs2002.evaluate(answers);
  return (
    <div className="space-y-4">
      <div className="max-w-40 space-y-1">
        <Label htmlFor="nrs-age">Idade (anos)</Label>
        <Input id="nrs-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Triagem inicial</legend>
        <YesNo id="nrs-bmi" label={`IMC < 20,5${prefill.bmi !== null ? ` (último: ${fmt(prefill.bmi)})` : ''}`} value={bmiLow} onChange={setBmiLow} />
        <YesNo id="nrs-loss" label={`Perdeu peso nos últimos 3 meses${prefill.loss_3m ? ` (${fmt(prefill.loss_3m)}% pelas avaliações)` : ''}`} value={lost} onChange={setLost} />
        <YesNo id="nrs-intake" label="Reduziu a ingestão na última semana" value={intake} onChange={setIntake} />
        <YesNo id="nrs-ill" label="Está gravemente doente (ex.: em terapia intensiva)" value={ill} onChange={setIll} />
      </fieldset>
      {final && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Triagem final</legend>
          <div className="space-y-1">
            <Label htmlFor="nrs-status">Comprometimento do estado nutricional</Label>
            <select id="nrs-status" value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT}>
              <option value="">Escolha</option>
              {NRS_STATUS_OPTIONS.map((t, i) => <option key={t} value={i}>{i} — {t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nrs-sev">Gravidade da doença</Label>
            <select id="nrs-sev" value={severity} onChange={(e) => setSeverity(e.target.value)} className={SELECT}>
              <option value="">Escolha</option>
              {NRS_SEVERITY_OPTIONS.map((t, i) => <option key={t} value={i}>{i} — {t}</option>)}
            </select>
          </div>
          {num(age) >= 70 && <p className="text-xs text-muted-foreground sm:col-span-2">Idade ≥ 70 anos: soma 1 ponto.</p>}
        </fieldset>
      )}
      <Footer result={result} errors={errors} s={s} onSave={() => s.save(answers as unknown as Record<string, unknown>)} />
    </div>
  );
}

const PHYSICAL = ['Normal', 'Leve', 'Moderada', 'Grave'] as const;

function SgaForm({ patientId, prefill }: { patientId: string; prefill: ScreeningPrefill }) {
  const s = useSave(patientId, 'sga');
  const [loss, setLoss] = useState(fmt(prefill.loss_6m ?? 0));
  const [trend, setTrend] = useState<SgaAnswers['recentTrend']>('stable');
  const [intake, setIntake] = useState<SgaAnswers['intake']>('normal');
  const [gi, setGi] = useState(false);
  const [functional, setFunctional] = useState<SgaAnswers['functional']>('full');
  const [stress, setStress] = useState<SgaAnswers['diseaseStress']>('none');
  const [phys, setPhys] = useState({ fatLoss: 0, muscleWasting: 0, edema: 0, ascites: 0 });
  const [finalClass, setFinalClass] = useState<SgaClass | ''>('');
  const base = { weightLossPct: num(loss), recentTrend: trend, intake, giSymptoms: gi, functional, diseaseStress: stress, ...phys } as Omit<SgaAnswers, 'finalClass'>;
  const suggestion = Number.isFinite(base.weightLossPct) ? sgaSuggestion(base) : null;
  const answers = { ...base, finalClass: finalClass as SgaClass };
  const errors = sga.validate(answers);
  const result = Object.keys(errors).length ? null : sga.evaluate(answers);
  const sel = <K extends string>(id: string, label: string, value: K, set: (v: K) => void, opts: Array<[K, string]>) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(e) => set(e.target.value as K)} className={SELECT}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
    </div>
  );
  return (
    <div className="space-y-4">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">História</legend>
        <div className="space-y-1">
          <Label htmlFor="sga-loss">Perda de peso em 6 meses (%)</Label>
          <Input id="sga-loss" inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} />
        </div>
        {sel('sga-trend', 'Peso nas últimas 2 semanas', trend, setTrend, [['stable', 'Estável'], ['gain', 'Aumentou'], ['loss', 'Diminuiu']])}
        {sel('sga-intake', 'Ingestão alimentar', intake, setIntake, [['normal', 'Sem alteração'], ['suboptimal_solid', 'Dieta sólida insuficiente'], ['liquid_only', 'Só dieta líquida completa'], ['hypocaloric_liquid', 'Líquidos hipocalóricos'], ['starvation', 'Jejum / quase nada']])}
        {sel('sga-func', 'Capacidade funcional', functional, setFunctional, [['full', 'Sem limitação'], ['reduced', 'Trabalho ou atividade reduzidos'], ['bedridden', 'Acamado']])}
        {sel('sga-stress', 'Demanda metabólica da doença', stress, setStress, [['none', 'Nenhuma'], ['low', 'Baixa'], ['moderate', 'Moderada'], ['high', 'Alta']])}
        <YesNo id="sga-gi" label="Sintomas gastrointestinais por mais de 2 semanas" value={gi} onChange={setGi} />
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-medium">Exame físico</legend>
        {([['fatLoss', 'Perda de gordura'], ['muscleWasting', 'Perda muscular'], ['edema', 'Edema'], ['ascites', 'Ascite']] as const).map(([k, label]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`sga-${k}`}>{label}</Label>
            <select id={`sga-${k}`} value={phys[k]} onChange={(e) => setPhys((p) => ({ ...p, [k]: Number(e.target.value) }))} className={SELECT}>
              {PHYSICAL.map((t, i) => <option key={t} value={i}>{t}</option>)}
            </select>
          </div>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Classificação (decisão do profissional)</legend>
        {suggestion && <p className="text-sm text-muted-foreground">Sugestão pelas respostas: <strong>{SGA_CLASS_LABEL[suggestion]}</strong></p>}
        <div role="radiogroup" aria-label="Classificação final" className="flex flex-wrap gap-2">
          {(['A', 'B', 'C'] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={finalClass === c} onClick={() => setFinalClass(c)}
              className={`min-h-11 rounded-xl border px-3 text-sm ${finalClass === c ? 'border-primary bg-primary/10 font-medium' : 'border-border'}`}>
              {SGA_CLASS_LABEL[c]}
            </button>
          ))}
        </div>
      </fieldset>
      <Footer result={result} errors={errors} s={s} onSave={() => s.save(answers as unknown as Record<string, unknown>, () => setFinalClass(''))} />
    </div>
  );
}
