'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addMaternalMeasurement, openPregnancy, updatePregnancy } from '@/lib/maternal/actions';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

function Feedback({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}>{message.text}</p>;
}

/** Nova medida: peso, comprimento/estatura, perímetro cefálico (crianças) e posição da medida. */
export function MeasurementForm({ patientId, child, under2 }: { patientId: string; child: boolean; under2: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [head, setHead] = useState('');
  const [lying, setLying] = useState(under2);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await addMaternalMeasurement(patientId, {
        assessed_at: date, weight_kg: num(weight), height_cm: num(height), head_circumference_cm: child ? num(head) : null, measured_lying: child && height.trim() ? lying : null,
      });
      if (!r.ok) return setMessage({ ok: false, text: Object.values(r.fields ?? {})[0] ?? r.message });
      setMessage({ ok: true, text: 'Medida registrada.' });
      setWeight(''); setHeight(''); setHead('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4" aria-label="Nova medida">
      <p className="font-medium">Nova medida</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="mm-date">Data</Label><Input id="mm-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor="mm-w">Peso (kg)</Label><Input id="mm-w" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Ex.: 9,4" /></div>
        {child && <div className="space-y-1"><Label htmlFor="mm-h">{under2 ? 'Comprimento (cm)' : 'Estatura (cm)'}</Label><Input id="mm-h" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Ex.: 76,5" /></div>}
        {child && <div className="space-y-1"><Label htmlFor="mm-hc">Perímetro cefálico (cm)</Label><Input id="mm-hc" inputMode="decimal" value={head} onChange={(e) => setHead(e.target.value)} placeholder="Opcional" /></div>}
      </div>
      {child && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lying} onChange={(e) => setLying(e.target.checked)} className="size-4" />
          Medida deitada (padrão até 2 anos; a OMS corrige 0,7 cm quando a posição foge do padrão)
        </label>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}Salvar medida</Button>
        <Feedback message={message} />
      </div>
    </form>
  );
}

/** Abrir o acompanhamento da gestação: DUM, peso pré-gestacional e altura. */
export function OpenPregnancyForm({ patientId, defaultHeight }: { patientId: string; defaultHeight: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [lmp, setLmp] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState(defaultHeight ? String(defaultHeight).replace('.', ',') : '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await openPregnancy(patientId, { lmp_date: lmp, pre_pregnancy_weight_kg: num(weight) ?? 0, height_cm: num(height) ?? 0 });
      if (!r.ok) return setMessage({ ok: false, text: Object.values(r.fields ?? {})[0] ?? r.message });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4" aria-label="Acompanhar gestação">
      <p className="font-medium">Acompanhar gestação</p>
      <p className="text-sm text-muted-foreground">O peso pré-gestacional é o informado pela paciente, o medido até 8 semanas ou o habitual.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="pg-lmp">Data da última menstruação (DUM)</Label><Input id="pg-lmp" type="date" value={lmp} max={today()} onChange={(e) => setLmp(e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor="pg-w">Peso pré-gestacional (kg)</Label><Input id="pg-w" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor="pg-h">Altura (cm)</Label><Input id="pg-h" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} required /></div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}Começar acompanhamento</Button>
        <Feedback message={message} />
      </div>
    </form>
  );
}

/** Encerrar (parto, perda ou outro motivo) ou reabrir a gestação. */
export function EndPregnancyForm({ patientId, pregnancyId, active }: { patientId: string; pregnancyId: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [date, setDate] = useState(today());
  const [outcome, setOutcome] = useState<'birth' | 'loss' | 'other'>('birth');

  const run = (body: Record<string, unknown>) =>
    start(async () => {
      const r = await updatePregnancy(patientId, pregnancyId, body);
      if (!r.ok) return setMessage({ ok: false, text: Object.values(r.fields ?? {})[0] ?? r.message });
      setOpen(false);
      router.refresh();
    });

  if (!active) return <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run({ reopen: true })}>Reabrir acompanhamento</Button>;
  if (!open) return <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Encerrar gestação</Button>;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="space-y-1"><Label htmlFor="pe-date">Data</Label><Input id="pe-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="space-y-1">
        <Label htmlFor="pe-out">Motivo</Label>
        <select id="pe-out" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="birth">Parto</option><option value="loss">Perda gestacional</option><option value="other">Outro motivo</option>
        </select>
      </div>
      <Button type="button" size="sm" disabled={pending} onClick={() => run({ end: true, ended_on: date, outcome })}>{pending && <Loader2 className="size-4 animate-spin" />}Confirmar</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Voltar</Button>
      <Feedback message={message} />
    </div>
  );
}
