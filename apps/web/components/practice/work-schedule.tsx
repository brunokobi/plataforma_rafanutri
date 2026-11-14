'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WorkSchedule } from '@/lib/appointments/schema';
import { saveWorkSchedule } from '@/lib/practice/actions';

const DAYS: Array<[number, string]> = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']];

/** RN-022 — Expediente usado na sugestão de horários livres da agenda. Só o owner muda. */
export function WorkScheduleForm({ orgId, initial, canEdit }: { orgId: string; initial: WorkSchedule; canEdit: boolean }) {
  const router = useRouter();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [days, setDays] = useState<number[]>(initial.weekdays);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const r = await saveWorkSchedule(orgId, { start, end, weekdays: [...days].sort((a, b) => a - b) });
      setFeedback(r.ok ? { ok: true, text: 'Expediente salvo.' } : { ok: false, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="work-schedule" className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 id="work-schedule" className="font-display text-xl font-semibold">Expediente da agenda</h2>
        <p className="mt-1 text-sm text-muted-foreground">Os horários livres sugeridos ao marcar consulta ficam dentro deste expediente. Fora dele, você ainda pode digitar o horário.</p>
      </div>
      {!canEdit && <p className="text-sm text-muted-foreground">Só o responsável (owner) do consultório muda o expediente.</p>}
      <form onSubmit={submit} className="space-y-4" aria-label="Expediente da agenda">
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="ws-start">Início</Label>
            <Input id="ws-start" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ws-end">Fim</Label>
            <Input id="ws-end" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Dias de atendimento</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(([d, label]) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  disabled={!canEdit}
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                  className={on ? 'rounded-md border border-primary bg-primary px-3 py-1.5 text-sm text-primary-foreground' : 'rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted'}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
        {canEdit && (
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Salvar expediente
          </Button>
        )}
        {feedback && (
          <p role="status" className={feedback.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>{feedback.text}</p>
        )}
      </form>
    </section>
  );
}
