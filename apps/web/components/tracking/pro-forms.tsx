'use client';

import { Archive, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { archiveGoal, createGoal, setWaterGoal } from '@/lib/tracking/actions';
import { goalProgress, kg, type Goal } from '@/lib/tracking/types';

const SUGGESTIONS = ['Comer 3 porções de fruta', 'Caminhar 30 minutos', 'Jantar até as 20h', 'Incluir salada no almoço', 'Dormir 7 horas', 'Evitar refrigerante'];

/** Metas do paciente: criar (hábito diário/semanal ou peso-alvo) e arquivar. */
export function GoalManager({ patientId, goals, weightNeutral }: { patientId: string; goals: Goal[]; weightNeutral: boolean }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [kind, setKind] = useState<'habit' | 'weight'>('habit');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [times, setTimes] = useState('3');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createGoal(patientId, {
        title: kind === 'weight' && !title.trim() ? 'Chegar ao peso-meta' : title, details, kind, frequency,
        times_per_week: frequency === 'weekly' ? Number(times) : null, target_weight_kg: kind === 'weight' ? target.replace(',', '.') : null,
      });
      if (r.ok) {
        toast.success('Meta criada. O paciente já vê no app.');
        setAdding(false); setTitle(''); setDetails(''); setTarget('');
        router.refresh();
      } else setError(r.message);
    });
  };

  const archive = (g: Goal) => start(async () => {
    const r = await archiveGoal(patientId, g.id);
    if (r.ok) { toast.success('Meta arquivada.'); router.refresh(); } else toast.error(r.message);
  });

  return (
    <div className="space-y-2">
      {goals.length === 0 && !adding && <p className="text-sm text-muted-foreground">Nenhuma meta ativa. Metas aparecem no app do paciente para ele marcar no dia a dia.</p>}
      <ul className="space-y-2">
        {goals.map((g) => {
          const p = goalProgress(g);
          return (
            <li key={g.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.title}</p>
                <p className="text-xs text-muted-foreground">
                  {g.kind === 'weight' ? `Peso-meta ${kg(g.target_weight_kg!)}` : `${g.frequency === 'weekly' ? `${g.times_per_week}x por semana` : 'Todo dia'} · ${p.done}/${p.of} nesta semana · ${g.done_today ? 'feita hoje' : 'não marcada hoje'}`}
                </p>
                {g.kind === 'habit' && <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} /></span>}
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => archive(g)} aria-label={`Arquivar a meta ${g.title}`}><Archive className="size-4" /></Button>
            </li>
          );
        })}
      </ul>
      {adding ? (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Tipo de meta">
            {((weightNeutral ? ['habit'] : ['habit', 'weight']) as Array<'habit' | 'weight'>).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={`min-h-10 rounded-full border px-3.5 text-sm ${kind === k ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground'}`}>
                {k === 'habit' ? 'Hábito' : 'Peso-meta'}
              </button>
            ))}
          </div>
          {kind === 'habit' ? (
            <>
              <label className="block text-sm">
                <span className="font-medium">Meta</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Ex.: Comer 3 porções de fruta" className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3" />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => setTitle(s)} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">{s}</button>)}
              </div>
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label>
                  <span className="font-medium">Frequência</span>
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')} className="mt-1 block h-11 rounded-lg border border-border bg-background px-2">
                    <option value="daily">Todo dia</option>
                    <option value="weekly">Algumas vezes por semana</option>
                  </select>
                </label>
                {frequency === 'weekly' && (
                  <label>
                    <span className="font-medium">Vezes por semana</span>
                    <select value={times} onChange={(e) => setTimes(e.target.value)} className="mt-1 block h-11 rounded-lg border border-border bg-background px-2">
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <label className="block text-sm">
                <span className="font-medium">Detalhe para o paciente</span> <span className="text-muted-foreground">(opcional)</span>
                <input value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} placeholder="Ex.: pode ser no lanche da manhã e da tarde" className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3" />
              </label>
            </>
          ) : (
            <label className="block text-sm">
              <span className="font-medium">Peso-meta (kg)</span>
              <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d,.]/g, ''))} required placeholder="68,0" className="mt-1 h-11 w-40 rounded-lg border border-border bg-background px-3" />
              <span className="mt-1 block text-xs text-muted-foreground">Aparece como linha tracejada no gráfico de peso do paciente. Substitui o peso-meta anterior.</span>
            </label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Criar meta</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Nova meta</Button>
      )}
    </div>
  );
}

/** Meta de água do paciente (vazia = 35 ml/kg). */
export function WaterGoalForm({ patientId, value, suggested }: { patientId: string; value: number | null; suggested: number }) {
  const [ml, setMl] = useState(value ? String(value) : '');
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await setWaterGoal(patientId, ml ? Number(ml) : null);
      if (r.ok) { toast.success(ml ? 'Meta de água salva.' : 'Meta de água volta a ser calculada pelo peso.'); router.refresh(); } else toast.error(r.message);
    });
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2 text-sm">
      <label>
        <span className="font-medium">Meta de água (ml/dia)</span>
        <input inputMode="numeric" value={ml} onChange={(e) => setMl(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={`${suggested} (pelo peso)`} className="mt-1 block h-10 w-44 rounded-lg border border-border bg-background px-3" />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
    </form>
  );
}
