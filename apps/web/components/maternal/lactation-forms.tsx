'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createLactation, updateLactation } from '@/lib/maternal/actions';
import { FEEDING_TYPE_LABEL } from '@/lib/maternal/feeding';
import type { FeedingType } from '@/lib/maternal/types';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30';
const TYPES = Object.keys(FEEDING_TYPE_LABEL) as FeedingType[];

type Baby = { id: string; full_name: string };

/** RN-114 — Registrar a lactação: início (parto), tipo de aleitamento e o bebê, se for paciente do consultório. */
export function OpenLactationForm({ patientId, defaultStart, babies }: { patientId: string; defaultStart: string | null; babies: Baby[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startedOn, setStartedOn] = useState(defaultStart ?? today());
  const [type, setType] = useState<FeedingType>('exclusive');
  const [baby, setBaby] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createLactation(patientId, { started_on: startedOn, feeding_type: type, baby_patient_id: baby || null });
      if (!r.ok) return setError(Object.values(r.fields ?? {})[0] ?? r.message);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4" aria-label="Registrar lactação">
      <p className="font-medium">Registrar lactação</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="lc-start">Início (data do parto)</Label><Input id="lc-start" type="date" value={startedOn} max={today()} onChange={(e) => setStartedOn(e.target.value)} required /></div>
        <div className="space-y-1">
          <Label htmlFor="lc-type">Tipo de aleitamento</Label>
          <select id="lc-type" value={type} onChange={(e) => setType(e.target.value as FeedingType)} className={SELECT}>
            {TYPES.map((t) => <option key={t} value={t}>{FEEDING_TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="lc-baby">Bebê (se for paciente)</Label>
          <select id="lc-baby" value={baby} onChange={(e) => setBaby(e.target.value)} className={SELECT}>
            <option value="">Não cadastrado</option>
            {babies.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}Registrar</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}

/** Mudar o tipo de aleitamento, encerrar (desmame) ou reabrir. */
export function LactationActions({ patientId, lactationId, active, type }: { patientId: string; lactationId: string; active: boolean; type: FeedingType }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [date, setDate] = useState(today());

  const run = (body: Record<string, unknown>) =>
    start(async () => {
      setError(null);
      const r = await updateLactation(patientId, lactationId, body);
      if (!r.ok) return setError(Object.values(r.fields ?? {})[0] ?? r.message);
      setEnding(false);
      router.refresh();
    });

  if (!active) return <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run({ reopen: true })}>Reabrir lactação</Button>;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor={`lt-${lactationId}`}>Tipo atual</Label>
        <select id={`lt-${lactationId}`} value={type} disabled={pending} onChange={(e) => run({ feeding_type: e.target.value })} className={SELECT}>
          {TYPES.map((t) => <option key={t} value={t}>{FEEDING_TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      {ending ? (
        <>
          <div className="space-y-1"><Label htmlFor={`le-${lactationId}`}>Data do desmame</Label><Input id={`le-${lactationId}`} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></div>
          <Button type="button" size="sm" disabled={pending} onClick={() => run({ end: true, ended_on: date })}>{pending && <Loader2 className="size-4 animate-spin" />}Confirmar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEnding(false)}>Voltar</Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setEnding(true)}>Encerrar lactação</Button>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
