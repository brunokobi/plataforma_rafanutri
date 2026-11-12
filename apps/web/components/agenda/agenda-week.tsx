'use client';

import { AlertCircle, CalendarPlus, ChevronLeft, ChevronRight, Loader2, Video } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AppointmentForm, type PatientOption } from '@/components/agenda/appointment-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { rescheduleAppointment, setAppointmentStatus } from '@/lib/appointments/actions';
import {
  addDays,
  durationOf,
  localDate,
  localTime,
  MODE_LABEL,
  OPEN_STATUSES,
  STATUS_LABEL,
  TYPE_LABEL,
  weekDays,
  type Appointment,
  type AppointmentStatus,
} from '@/lib/appointments/schema';
import { cn } from '@/lib/utils';

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dayLabel = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return { weekday: WEEKDAY[d.getUTCDay()]!, day: d.getUTCDate(), month: d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }) };
};
const STATUS_STYLE: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-primary/60',
  confirmed: 'border-l-primary',
  completed: 'border-l-muted-foreground/40 opacity-80',
  cancelled: 'border-l-muted-foreground/20 opacity-60 line-through decoration-muted-foreground/40',
  no_show: 'border-l-tomato opacity-70',
};

function AppointmentCard({ a, onMessage }: { a: Appointment; onMessage: (m: { kind: 'ok' | 'error'; text: string }) => void }) {
  const [pending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(localDate(a.starts_at));
  const [time, setTime] = useState(localTime(a.starts_at));
  const open = OPEN_STATUSES.includes(a.status);
  const name = a.patient_id?.full_name ?? 'Paciente';

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) =>
    startTransition(async () => {
      const r = await fn();
      onMessage(r.ok ? { kind: 'ok', text: okText } : { kind: 'error', text: r.message ?? 'Algo deu errado.' });
      if (r.ok) setRescheduling(false);
    });

  return (
    <li className={cn('rounded-xl border border-border border-l-4 bg-card p-3 text-sm', STATUS_STYLE[a.status])} aria-label={`${localTime(a.starts_at)} ${name}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold tabular-nums">
          {localTime(a.starts_at)}–{localTime(a.ends_at)}
        </p>
        <Badge variant="secondary" className="no-underline">{STATUS_LABEL[a.status]}</Badge>
      </div>
      {a.patient_id ? (
        <Link href={`/app/pacientes/${a.patient_id.id}`} className="mt-1 block truncate font-medium hover:underline">{name}</Link>
      ) : (
        <p className="mt-1 truncate font-medium">{name}</p>
      )}
      <p className="text-xs text-muted-foreground">{TYPE_LABEL[a.type]} · {MODE_LABEL[a.mode]}</p>
      {a.notes && <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p>}
      {a.mode === 'online' && a.meeting_url && open && (
        <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Video className="size-3.5" /> Entrar na chamada
        </a>
      )}

      {(open || a.status === 'no_show') && !rescheduling && (
        <div className="mt-2 flex flex-wrap gap-1">
          {a.status === 'scheduled' && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'confirmed'), `Consulta de ${name} confirmada.`)}>Confirmar</Button>
          )}
          {open && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'completed'), `Consulta de ${name} concluída.`)}>Concluir</Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => setRescheduling(true)}>Remarcar</Button>
          {open && (
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'no_show'), `Falta de ${name} registrada.`)}>Faltou</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'cancelled'), `Consulta de ${name} cancelada.`)}>Cancelar</Button>
            </>
          )}
          {pending && <Loader2 className="size-4 animate-spin self-center" aria-label="Salvando" />}
        </div>
      )}
      {a.status === 'completed' && a.patient_id && (
        <Link href={`/app/pacientes/${a.patient_id.id}`} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Abrir ficha do paciente</Link>
      )}

      {rescheduling && (
        <form
          className="mt-2 space-y-2"
          aria-label={`Remarcar consulta de ${name}`}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => rescheduleAppointment(a.id, { date, time, duration: durationOf(a) }), `Consulta de ${name} remarcada.`);
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`rd-${a.id}`} className="text-xs">Nova data</Label>
              <Input id={`rd-${a.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label htmlFor={`rt-${a.id}`} className="text-xs">Horário</Label>
              <Input id={`rt-${a.id}`} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="h-8" />
            </div>
          </div>
          <div className="flex gap-1">
            <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={pending}>Salvar</Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRescheduling(false)} disabled={pending}>Voltar</Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function AgendaWeek({
  start,
  todayDate,
  appointments,
  patients,
  defaultPatientId,
}: {
  /** Segunda-feira da semana exibida (AAAA-MM-DD). */
  start: string;
  todayDate: string;
  /** null = falha ao carregar do Directus. */
  appointments: Appointment[] | null;
  patients: PatientOption[];
  defaultPatientId?: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(Boolean(defaultPatientId));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const days = weekDays(start);
  const end = days[6]!;
  const range = `${dayLabel(start).day} ${dayLabel(start).month} – ${dayLabel(end).day} ${dayLabel(end).month}`;
  const active = (appointments ?? []).filter((a) => a.status !== 'cancelled');
  const formDefaultDate = todayDate >= start && todayDate <= end ? todayDate : start;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Semana anterior">
            <Link href={`/app/agenda?semana=${addDays(start, -7)}`}><ChevronLeft className="size-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Próxima semana">
            <Link href={`/app/agenda?semana=${addDays(start, 7)}`}><ChevronRight className="size-4" /></Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/agenda">Hoje</Link>
          </Button>
          <p className="ml-1 font-medium" aria-live="polite">{range}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{active.length} consulta(s) na semana</p>
          <Button type="button" onClick={() => { setCreating(true); setMessage(null); }} disabled={creating}>
            <CalendarPlus className="size-4" /> Nova consulta
          </Button>
        </div>
      </div>

      {creating && (
        <AppointmentForm
          patients={patients}
          appointments={appointments ?? []}
          defaultDate={formDefaultDate}
          defaultPatientId={defaultPatientId}
          onCancel={() => setCreating(false)}
          onDone={(date) => {
            setCreating(false);
            setMessage({ kind: 'ok', text: 'Consulta marcada.' });
            if (date < start || date > end) router.push(`/app/agenda?semana=${date}`);
          }}
        />
      )}

      {message && (
        <p role="status" className={cn('text-sm', message.kind === 'ok' ? 'text-primary' : 'text-destructive')}>{message.text}</p>
      )}

      {appointments === null ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>Não foi possível carregar a agenda agora. Atualize a página em instantes.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-7">
          {days.map((d) => {
            const list = appointments.filter((a) => localDate(a.starts_at) === d);
            const label = dayLabel(d);
            const isToday = d === todayDate;
            return (
              <section key={d} aria-label={`${label.weekday} ${label.day} ${label.month}`} className={cn('min-w-0 rounded-2xl border border-border p-2', isToday && 'border-primary/60 bg-primary/5')}>
                <h2 className="mb-2 flex items-baseline gap-1.5 px-1 text-sm">
                  <span className="font-medium capitalize text-muted-foreground">{label.weekday}</span>
                  <span className={cn('font-semibold', isToday && 'text-primary')}>{label.day}</span>
                  <span className="text-xs text-muted-foreground">{label.month}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="px-1 pb-2 text-xs text-muted-foreground">Sem consultas</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((a) => (
                      <AppointmentCard key={a.id} a={a} onMessage={setMessage} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
