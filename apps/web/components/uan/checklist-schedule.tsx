'use client';

import { Copy, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addSchedule, copyTemplate, removeSchedule } from '@/lib/uan/checklist-actions';
import { WEEKDAY_SHORT, weekdaysLabel, type ChecklistTemplateSummary, type Schedule } from '@/lib/uan/checklists';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Copia o modelo da biblioteca para a empresa e abre o editor. */
export function CopyTemplate({ unitId, templateId, name }: { unitId: string; templateId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <Button
        type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Personalizar ${name}`}
        onClick={() => startTransition(async () => {
          setError(null);
          const r = await copyTemplate(unitId, templateId);
          if (r.ok) router.push(`/app/uan/modelos/${r.id}?unidade=${unitId}`);
          else setError(r.message);
        })}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} Personalizar
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

/** Agenda da unidade: o que é feito em quais dias e horários (sem avisos por enquanto). */
export function ScheduleManager({ unitId, schedules, templates }: { unitId: string; schedules: Schedule[]; templates: ChecklistTemplateSummary[] }) {
  const router = useRouter();
  const [v, setV] = useState({ template_id: templates[0]?.id ?? '', weekdays: [1, 2, 3, 4, 5] as number[], at_time: '07:00', tolerance: '60' });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      if (r.ok) {
        setMessage({ text: done });
        router.refresh();
      } else setMessage({ text: r.message ?? 'Não foi possível salvar.', error: true });
    });
  const toggle = (d: number) => setV((s) => ({ ...s, weekdays: s.weekdays.includes(d) ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d] }));

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-semibold">Agenda da unidade</h3>
      {schedules.length > 0 && (
        <ul aria-label="Checklists agendados" className="divide-y divide-border text-sm">
          {schedules.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <span>{s.template_name} · {weekdaysLabel(s.weekdays)} às {s.at_time} <span className="text-muted-foreground">(tolerância {s.tolerance_minutes} min)</span></span>
              <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remover ${s.template_name} da agenda`} disabled={pending}
                onClick={() => run(() => removeSchedule(unitId, s.id), 'Removido da agenda.')}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        aria-label="Agendar checklist"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addSchedule(unitId, { template_id: v.template_id, weekdays: v.weekdays, at_time: v.at_time, tolerance_minutes: Number(v.tolerance) }), 'Checklist agendado.');
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="sc-template">Checklist</Label>
          <select id="sc-template" className={SELECT} value={v.template_id} onChange={(e) => setV({ ...v, template_id: e.target.value })}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="text-sm font-medium">Dias</legend>
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_SHORT.map((d, i) => (
              <label key={d} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                <input type="checkbox" className="size-4" checked={v.weekdays.includes(i + 1)} onChange={() => toggle(i + 1)} /> {d}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="sc-time">Horário</Label>
          <Input id="sc-time" type="time" value={v.at_time} onChange={(e) => setV({ ...v, at_time: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sc-tol">Tolerância (min)</Label>
          <Input id="sc-tol" inputMode="numeric" value={v.tolerance} onChange={(e) => setV({ ...v, tolerance: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="outline" disabled={pending || !v.template_id}>{pending && <Loader2 className="size-4 animate-spin" />} Agendar</Button>
        </div>
      </form>
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}
    </div>
  );
}
