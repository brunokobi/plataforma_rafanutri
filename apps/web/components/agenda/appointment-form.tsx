'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAppointment } from '@/lib/appointments/actions';
import {
  DEFAULT_DURATION,
  freeSlots,
  MODE_LABEL,
  TYPE_LABEL,
  type Appointment,
  type AppointmentMode,
  type AppointmentType,
} from '@/lib/appointments/schema';

const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

export interface PatientOption {
  id: string;
  full_name: string;
}

export function AppointmentForm({
  patients,
  appointments,
  defaultDate,
  defaultPatientId,
  onDone,
  onCancel,
}: {
  patients: PatientOption[];
  /** Consultas já carregadas (para sugerir horários livres no dia escolhido). */
  appointments: Appointment[];
  defaultDate: string;
  defaultPatientId?: string;
  onDone: (date: string) => void;
  onCancel: () => void;
}) {
  const [patientId, setPatientId] = useState(defaultPatientId ?? '');
  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState<AppointmentType>('return');
  const [duration, setDuration] = useState(DEFAULT_DURATION.return);
  const [time, setTime] = useState('');
  const [mode, setMode] = useState<AppointmentMode>('in_person');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const slots = useMemo(() => freeSlots(date, appointments, duration, { now: new Date() }), [date, appointments, duration]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patientId) return setError('Escolha o paciente.');
    if (!time) return setError('Escolha o horário.');
    startTransition(async () => {
      const r = await createAppointment({ patient_id: patientId, date, time, duration, type, mode, meeting_url: meetingUrl, notes });
      if (r.ok) onDone(date);
      else setError(r.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Nova consulta" className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-semibold">Nova consulta</h2>
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {patients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Cadastre um paciente ativo antes de marcar consultas.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ap-patient">Paciente</Label>
            <select id="ap-patient" value={patientId} onChange={(e) => setPatientId(e.target.value)} className={selectClass}>
              <option value="">Escolha…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-type">Tipo</Label>
            <select
              id="ap-type"
              value={type}
              onChange={(e) => {
                const t = e.target.value as AppointmentType;
                setType(t);
                setDuration(DEFAULT_DURATION[t]);
              }}
              className={selectClass}
            >
              {(Object.keys(TYPE_LABEL) as AppointmentType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-duration">Duração (min)</Label>
            <Input id="ap-duration" type="number" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-date">Data</Label>
            <Input id="ap-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(''); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-time">Horário</Label>
            <Input id="ap-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Horários livres nesse dia (expediente 08h–18h):</p>
            {slots.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nenhum horário livre para essa duração. Escolha outro dia ou digite o horário.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Horários livres">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTime(s)}
                    aria-pressed={time === s}
                    className={`rounded-md border px-2 py-1 text-xs tabular-nums ${time === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-mode">Atendimento</Label>
            <select id="ap-mode" value={mode} onChange={(e) => setMode(e.target.value as AppointmentMode)} className={selectClass}>
              {(Object.keys(MODE_LABEL) as AppointmentMode[]).map((m) => (
                <option key={m} value={m}>{MODE_LABEL[m]}</option>
              ))}
            </select>
          </div>
          {mode === 'online' && (
            <div className="space-y-1.5">
              <Label htmlFor="ap-url">Link da chamada (opcional)</Label>
              <Input id="ap-url" type="url" placeholder="https://meet.google.com/…" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ap-notes">Observação (opcional, não clínica)</Label>
            <Input id="ap-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: trazer exames" />
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="submit" disabled={pending || patients.length === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />} Marcar consulta
        </Button>
      </div>
    </form>
  );
}
