'use client';

import { AlertTriangle, Loader2, Thermometer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { recordTemperature } from '@/lib/uan/temperature-actions';
import { FOOD_STAGE_LABEL, FOOD_STAGE_LIMITS, formatTemp, limitsLabel, outOfRange, parseTemp, type FoodStage, type Limits } from '@/lib/uan/temperatures';

const SELECT = 'h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';
const TEXTAREA = 'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';
const STAGES = Object.keys(FOOD_STAGE_LABEL) as FoodStage[];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/**
 * Registro rápido de temperatura: de um equipamento (limites dele) ou de um alimento (limites da etapa).
 * Fora do limite, a ação corretiva é obrigatória (o banco também exige).
 */
export function RecordTemperature({ unitId, equipment, idPrefix = 'temp', initialFood = '', initialStage = 'cooking' }: { unitId: string; equipment?: { id: string; name: string } & Limits; idPrefix?: string; initialFood?: string; initialStage?: FoodStage }) {
  const router = useRouter();
  const [stage, setStage] = useState<FoodStage>(initialStage);
  const [food, setFood] = useState(initialFood);
  const [text, setText] = useState('');
  const [action, setAction] = useState('');
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const limits: Limits = equipment ?? FOOD_STAGE_LIMITS[stage];
  const value = parseTemp(text);
  const out = value !== null && outOfRange(value, limits);
  const id = (k: string) => `${idPrefix}-${k}`;

  const toggleSign = () => setText((s) => (s.trim().startsWith('-') ? s.trim().slice(1) : `-${s.trim()}`));
  const submit = () => {
    setError(null);
    setDone(null);
    if (value === null) return setError({ message: 'Informe a temperatura (ex.: 4,5 ou -18).', fields: { value: 'x' } });
    if (!equipment && food.trim().length < 2) return setError({ message: 'Informe o alimento ou a preparação.', fields: { food_name: 'x' } });
    if (out && !action.trim()) return setError({ message: 'Temperatura fora do limite: registre a ação corretiva.', fields: { corrective_action: 'x' } });
    startTransition(async () => {
      const r = await recordTemperature(unitId, {
        client_id: clientId,
        value,
        corrective_action: action.trim() || null,
        ...(equipment ? { equipment_id: equipment.id } : { food_stage: stage, food_name: food.trim() }),
      });
      if (!r.ok) return setError({ message: r.message, fields: r.fields });
      setDone(`Registrado: ${formatTemp(r.reading.value)} às ${hhmm(r.reading.recorded_at)}${r.reading.out_of_range ? ' (fora do limite, com ação corretiva)' : ' (dentro do limite)'}.`);
      setText('');
      setAction('');
      if (!equipment) setFood(initialFood);
      setClientId(crypto.randomUUID());
      router.refresh();
    });
  };

  return (
    <form
      aria-label={equipment ? `Registrar temperatura de ${equipment.name}` : 'Registrar temperatura de alimento'}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!equipment && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={id('stage')}>Etapa</Label>
            <select id={id('stage')} className={SELECT} value={stage} onChange={(e) => setStage(e.target.value as FoodStage)}>
              {STAGES.map((s) => <option key={s} value={s}>{FOOD_STAGE_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('food')}>Alimento ou preparação</Label>
            <Input id={id('food')} className="h-11" maxLength={120} value={food} onChange={(e) => setFood(e.target.value)} aria-invalid={Boolean(error?.fields?.food_name)} />
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={id('value')}>Temperatura (°C)</Label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-12 w-12 shrink-0 text-lg" onClick={toggleSign} aria-label="Trocar o sinal (negativo/positivo)">±</Button>
          <Input
            id={id('value')} inputMode="decimal" autoComplete="off" className="h-12 text-lg" placeholder="ex.: 4,5"
            value={text} onChange={(e) => setText(e.target.value)} aria-invalid={Boolean(error?.fields?.value)} aria-describedby={id('limits')}
          />
          <Button type="submit" size="lg" className="h-12 shrink-0" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Thermometer className="size-4" />} Registrar
          </Button>
        </div>
        <p id={id('limits')} className="text-sm text-muted-foreground">Limite: {limitsLabel(limits)}.</p>
      </div>
      {out && (
        <div className="space-y-1.5 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive"><AlertTriangle className="size-4" aria-hidden="true" /> Fora do limite: o que foi feito?</p>
          <Label htmlFor={id('action')} className="sr-only">Ação corretiva</Label>
          <textarea
            id={id('action')} className={TEXTAREA} maxLength={1000} value={action} onChange={(e) => setAction(e.target.value)}
            placeholder="Ex.: porta fechada, alimentos transferidos, técnico chamado" aria-invalid={Boolean(error?.fields?.corrective_action)} aria-label="Ação corretiva"
          />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      {done && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{done}</p>}
    </form>
  );
}
