'use client';

import { Loader2, Plus, Scale, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { deleteMyWeight, logMyWeight } from '@/lib/tracking/actions';
import { dateTimeBR, fromLocalDateTime, kg, localDateTimeValue, type WeightLog } from '@/lib/tracking/types';

const NOTES = ['Em jejum', 'Depois do café', 'Depois do treino', 'À noite'];

/** Registrar peso: o dia e o horário entram sozinhos (dá para corrigir se a pesagem foi antes). */
export function WeightLogger({ c, lastKg }: { c: string | null; lastKg: number | null }) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const openSheet = () => {
    setWeight(lastKg ? String(lastKg).replace('.', ',') : '');
    setWhen(localDateTimeValue());
    setNote('');
    setError(null);
    setOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const iso = fromLocalDateTime(when);
    start(async () => {
      const r = await logMyWeight(c, weight.replace(',', '.'), iso, note);
      if (r.ok) {
        setOpen(false);
        toast.success('Peso registrado. Seu nutricionista também vê.');
        router.refresh();
      } else setError(r.message);
    });
  };

  return (
    <>
      <Button type="button" onClick={openSheet} className="h-12 w-full rounded-xl text-base sm:w-auto">
        <Scale className="size-5" /> Registrar peso
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle>Registrar peso</SheetTitle>
            <SheetDescription>Para comparar bem, pese-se no mesmo horário, de preferência pela manhã, em jejum e com pouca roupa.</SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="space-y-4 px-4">
            <label className="block">
              <span className="text-sm font-medium">Peso</span>
              <span className="mt-1.5 flex items-center gap-2 rounded-2xl border border-border bg-background px-4 focus-within:border-primary">
                <input autoFocus inputMode="decimal" required value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="72,4"
                  aria-invalid={error ? true : undefined} className="h-16 min-w-0 flex-1 bg-transparent font-display text-4xl font-semibold tabular-nums outline-none" />
                <span className="text-lg text-muted-foreground">kg</span>
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Dia e horário da pesagem</span>
              <input type="datetime-local" required value={when} max={localDateTimeValue()} onChange={(e) => setWhen(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 text-base" />
            </label>
            <fieldset>
              <legend className="text-sm font-medium">Observação <span className="font-normal text-muted-foreground">(opcional)</span></legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {NOTES.map((n) => (
                  <button key={n} type="button" aria-pressed={note === n} onClick={() => setNote(note === n ? '' : n)}
                    className={`min-h-10 rounded-full border px-3.5 text-sm ${note === n ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground'}`}>{n}</button>
                ))}
              </div>
            </fieldset>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending || !weight} className="h-12 w-full rounded-xl text-base">
              {pending ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />} Salvar pesagem
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Últimas pesagens feitas em casa, com apagar (só as do próprio paciente). */
export function WeightLogList({ c, logs }: { c: string | null; logs: WeightLog[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!logs.length) return null;
  const remove = async (id: string) => {
    if (!window.confirm('Apagar esta pesagem?')) return;
    setBusy(id);
    const r = await deleteMyWeight(c, id);
    setBusy(null);
    if (r.ok) { toast.success('Pesagem apagada.'); router.refresh(); } else toast.error(r.message);
  };
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {[...logs].reverse().slice(0, 5).map((l) => (
        <li key={l.id} className="flex min-h-12 items-center gap-3 px-3 text-sm">
          <span className="font-semibold tabular-nums">{kg(l.weight_kg)}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{dateTimeBR(l.measured_at)}{l.note ? ` · ${l.note}` : ''}</span>
          {l.by_patient && (
            <button type="button" onClick={() => void remove(l.id)} disabled={busy === l.id} aria-label={`Apagar pesagem de ${dateTimeBR(l.measured_at)}`} className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive">
              {busy === l.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
