'use client';

import { BellRing, Droplets, Flame, GlassWater, Loader2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { logMyWater, saveWaterReminders, undoMyWater } from '@/lib/tracking/actions';
import { liters, type Tracking } from '@/lib/tracking/types';

type Water = NonNullable<Tracking['water']>;
const QUICK = [{ ml: 200, label: 'Copo', sub: '200 ml' }, { ml: 300, label: 'Copo grande', sub: '300 ml' }, { ml: 500, label: 'Garrafinha', sub: '500 ml' }];

/** Água do dia: anel de progresso, toques rápidos, desfazer e sequência de dias com a meta batida. */
export function WaterTracker({ c, water, compact = false }: { c: string | null; water: Water; compact?: boolean }) {
  const [total, setTotal] = useState(water.today_ml);
  const [stack, setStack] = useState<Array<{ id: string; ml: number }>>(water.today_logs.map((l) => ({ id: l.id, ml: l.amount_ml })));
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const router = useRouter();
  const pct = Math.min(1, total / water.goal_ml);
  const r = 52, circ = 2 * Math.PI * r;

  const add = async (ml: number) => {
    if (busy || ml < 20 || ml > 3000) return;
    setBusy(true);
    setTotal((t) => t + ml);
    const res = await logMyWater(c, ml);
    setBusy(false);
    if (res.ok && res.data) {
      setStack((s) => [...s, { id: res.data!.id, ml }]);
      if (total < water.goal_ml && total + ml >= water.goal_ml) toast.success('Meta de água do dia batida! 💧');
      router.refresh();
    } else {
      setTotal((t) => t - ml);
      toast.error(res.ok ? 'Não foi possível registrar.' : res.message);
    }
  };

  const undo = async () => {
    const last = stack.at(-1);
    if (!last || busy) return;
    setBusy(true);
    const res = await undoMyWater(c, last.id);
    setBusy(false);
    if (res.ok) { setStack((s) => s.slice(0, -1)); setTotal((t) => Math.max(0, t - last.ml)); router.refresh(); } else toast.error(res.message);
  };

  return (
    <div>
      <div className="flex items-center gap-5">
        <div className="relative size-32 shrink-0">
          <svg viewBox="0 0 120 120" className="size-32 -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-sky-500/15" />
            <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-sky-500 transition-[stroke-dashoffset] duration-500" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <Droplets className="mx-auto size-5 text-sky-500" aria-hidden="true" />
              <p className="font-display text-xl font-semibold tabular-nums">{liters(total)}</p>
              <p className="text-[11px] text-muted-foreground">de {liters(water.goal_ml)}</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <p role="status" className="font-semibold">{total >= water.goal_ml ? 'Meta batida hoje!' : `Faltam ${liters(water.goal_ml - total)}`}</p>
          <p className="text-muted-foreground">{water.goal_source === 'professional' ? 'Meta definida pelo seu nutricionista.' : water.goal_source === 'weight' ? 'Meta de 35 ml por kg de peso.' : 'Meta padrão de 2 litros.'}</p>
          {water.streak > 0 && <p className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200"><Flame className="size-3.5" aria-hidden="true" />{water.streak} {water.streak === 1 ? 'dia' : 'dias'} seguidos</p>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {QUICK.map((q) => (
          <button key={q.ml} type="button" onClick={() => void add(q.ml)} disabled={busy}
            className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/5 text-sky-900 transition-colors active:scale-[0.98] disabled:opacity-60 dark:text-sky-100">
            <span className="flex items-center gap-1 text-sm font-semibold"><GlassWater className="size-4" aria-hidden="true" />+{q.sub}</span>
            <span className="text-[11px] text-muted-foreground">{q.label}</span>
          </button>
        ))}
      </div>
      {!compact && (
        <div className="mt-3 flex items-center gap-2">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border px-3">
            <span className="sr-only">Outra quantidade em ml</span>
            <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Outra quantidade" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
            <span className="text-sm text-muted-foreground">ml</span>
          </label>
          <Button type="button" variant="outline" className="h-11" disabled={busy || !custom} onClick={() => { void add(Number(custom)); setCustom(''); }}>Adicionar</Button>
          <Button type="button" variant="ghost" className="h-11" disabled={busy || !stack.length} onClick={() => void undo()} aria-label="Desfazer o último registro">
            <Undo2 className="size-4" /><span className="hidden sm:inline">Desfazer</span>
          </Button>
        </div>
      )}
    </div>
  );
}

const EVERY = [60, 90, 120, 180, 240];
const everyLabel = (m: number) => (m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60}`);

/** Lembretes de água pelo Telegram: intervalo e janela do dia. */
export function WaterReminders({ c, initial, telegramHref }: { c: string | null; initial: Water['reminders']; telegramHref: string }) {
  const [s, setS] = useState(initial);
  const [needsTelegram, setNeedsTelegram] = useState(false);
  const [pending, start] = useTransition();
  const save = (next: typeof s) => {
    setS(next);
    start(async () => {
      const r = await saveWaterReminders(c, next);
      if (!r.ok) { toast.error(r.message); return; }
      setNeedsTelegram(next.on && !r.data?.telegram);
      toast.success(next.on ? 'Lembretes de água ligados.' : 'Lembretes de água desligados.');
    });
  };
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center gap-3">
        <BellRing className="size-5 text-sky-500" aria-hidden="true" />
        <p className="flex-1 text-sm font-semibold">Lembrar de beber água</p>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
        <button type="button" role="switch" aria-checked={s.on} aria-label="Lembrar de beber água" onClick={() => save({ ...s, on: !s.on })}
          className={`relative h-7 w-12 rounded-full transition-colors ${s.on ? 'bg-sky-500' : 'bg-muted-foreground/30'}`}>
          <span className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform ${s.on ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {s.on && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <label>
            <span className="text-xs text-muted-foreground">A cada</span>
            <select value={s.every_min} onChange={(e) => save({ ...s, every_min: Number(e.target.value) })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-2">
              {EVERY.map((m) => <option key={m} value={m}>{everyLabel(m)}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs text-muted-foreground">Das</span>
            <input type="time" value={s.start} onChange={(e) => e.target.value && e.target.value < s.end && save({ ...s, start: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-2" />
          </label>
          <label>
            <span className="text-xs text-muted-foreground">Até</span>
            <input type="time" value={s.end} onChange={(e) => e.target.value && e.target.value > s.start && save({ ...s, end: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-2" />
          </label>
          <p className="col-span-3 text-xs text-muted-foreground">O lembrete chega no Telegram e para sozinho quando você bate a meta do dia.</p>
        </div>
      )}
      {needsTelegram && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Para receber os lembretes, ligue o Telegram em <a href={telegramHref} className="font-semibold underline">Avisos no Telegram</a>.
        </p>
      )}
    </div>
  );
}
