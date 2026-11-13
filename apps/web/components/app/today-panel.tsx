import { CakeSlice, CalendarClock, CalendarPlus, ClipboardCheck, LibraryBig, UserPlus, Users, Video } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { localTime, MODE_LABEL, STATUS_LABEL, TYPE_LABEL } from '@/lib/appointments/schema';
import type { Dashboard } from '@/lib/dashboard-data';
import { cn } from '@/lib/utils';

const dateBR = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });

function Card({ title, icon: Icon, count, children, className }: { title: string; icon: typeof Users; count?: number | null; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      <h2 className="flex items-center gap-2 font-medium">
        <Icon className="size-4 text-primary" aria-hidden="true" /> {title}
        {count != null && count > 0 && <Badge variant="secondary">{count}</Badge>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Unavailable = () => <p className="text-sm text-destructive">Não foi possível carregar agora.</p>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

export function TodayPanel({ data, returnDays }: { data: Dashboard; returnDays: number }) {
  const active = (data.appointments ?? []).filter((a) => a.status !== 'cancelled');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight capitalize">{weekday(data.todayDate)}, {dateBR(data.todayDate)}</h2>
          {data.activePatients !== null && <p className="text-sm text-muted-foreground">{data.activePatients} pacientes ativos</p>}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Atalhos">
          <Button asChild variant="outline" size="sm"><Link href="/app/pacientes"><UserPlus className="size-4" /> Novo paciente</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/app/agenda"><CalendarPlus className="size-4" /> Nova consulta</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/app/modelos-de-plano"><LibraryBig className="size-4" /> Modelos de plano</Link></Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Consultas de hoje" icon={CalendarClock} count={active.length} className="lg:row-span-2">
          {data.appointments === null ? (
            <Unavailable />
          ) : active.length === 0 ? (
            <Empty>Nenhuma consulta hoje. <Link href="/app/agenda" className="font-medium text-primary hover:underline">Abrir a agenda</Link></Empty>
          ) : (
            <ul className="divide-y divide-border">
              {data.appointments
                .filter((a) => a.status !== 'cancelled')
                .map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="w-24 shrink-0 font-semibold tabular-nums">{localTime(a.starts_at)}–{localTime(a.ends_at)}</span>
                    <span className="min-w-0 flex-1">
                      {a.patient_id ? (
                        <Link href={`/app/pacientes/${a.patient_id.id}`} className="block truncate font-medium hover:underline">{a.patient_id.full_name}</Link>
                      ) : (
                        <span className="font-medium">Paciente</span>
                      )}
                      <span className="text-xs text-muted-foreground">{TYPE_LABEL[a.type]} · {MODE_LABEL[a.mode]}</span>
                    </span>
                    {a.mode === 'online' && a.meeting_url && ['scheduled', 'confirmed'].includes(a.status) && (
                      <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Video className="size-3.5" /> Chamada</a>
                    )}
                    <Badge variant={a.status === 'completed' ? 'outline' : 'secondary'}>{STATUS_LABEL[a.status]}</Badge>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card title="Anamneses para revisar" icon={ClipboardCheck} count={data.pendingAnamneses?.length}>
          {data.pendingAnamneses === null ? (
            <Unavailable />
          ) : data.pendingAnamneses.length === 0 ? (
            <Empty>Nenhuma anamnese respondida aguardando revisão.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.pendingAnamneses.map((a) => (
                <li key={a.id} className="text-sm">
                  {a.patient_id ? (
                    <Link href={`/app/pacientes/${a.patient_id.id}/anamneses`} className="font-medium hover:underline">{a.patient_id.full_name}</Link>
                  ) : (
                    'Paciente'
                  )}
                  <span className="text-muted-foreground"> · {a.title ?? 'Anamnese'}{a.answered_at ? ` · respondida em ${new Date(a.answered_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Sem retorno há mais de ${returnDays} dias`} icon={Users} count={data.withoutReturn?.length}>
          {data.withoutReturn === null ? (
            <Unavailable />
          ) : data.withoutReturn.length === 0 ? (
            <Empty>Todos os pacientes ativos com consulta recente ou retorno marcado.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.withoutReturn.slice(0, 8).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link href={`/app/pacientes/${p.id}`} className="font-medium hover:underline">{p.full_name}</Link>
                  <span className="text-muted-foreground">
                    última consulta em {dateBR(p.lastVisit)} ({p.daysSince} dias) ·{' '}
                    <Link href={`/app/agenda?paciente=${p.id}`} className="font-medium text-primary hover:underline">marcar retorno</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Aniversariantes da semana" icon={CakeSlice} count={data.birthdays?.length}>
        {data.birthdays === null ? (
          <Unavailable />
        ) : data.birthdays.length === 0 ? (
          <Empty>Nenhum aniversário nos próximos 7 dias.</Empty>
        ) : (
          <ul className="flex flex-wrap gap-x-6 gap-y-1.5">
            {data.birthdays.map((p) => (
              <li key={p.id} className="text-sm">
                <Link href={`/app/pacientes/${p.id}`} className="font-medium hover:underline">{p.full_name}</Link>
                <span className="text-muted-foreground"> · {p.date === data.todayDate ? 'hoje' : dateBR(p.date)} · {p.age} anos</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
