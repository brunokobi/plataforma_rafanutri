'use client';

import { CalendarClock, ChevronRight, Info, Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEMO_PATIENTS, type PatientStatus } from '@/lib/demo/patients';
import { cn } from '@/lib/utils';

const STATUS: Record<PatientStatus, string> = { active: 'Ativos', inactive: 'Inativos', archived: 'Arquivados' };
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const dateBR = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';

export function PatientsList({ patientHref, limit = 20 }: { patientHref: string; limit?: number }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PatientStatus>('active');
  const activeCount = DEMO_PATIENTS.filter((p) => p.status === 'active').length;

  const rows = useMemo(
    () => DEMO_PATIENTS.filter((p) => p.status === status && (!q || norm(p.name).includes(norm(q)) || norm(p.objective).includes(norm(q)))),
    [q, status],
  );

  return (
    <div className="space-y-6">
      <Alert>
        <Info />
        <AlertDescription>
          <p>
            Demonstração com pacientes fictícios. Só a ficha da <strong>Marina Costa</strong> está completa.
          </p>
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{activeCount} de {limit}</span> pacientes ativos no plano Gratuito
          </p>
          <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${activeCount} de ${limit} pacientes ativos`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${(activeCount / limit) * 100}%` }} />
          </div>
        </div>
        <Button type="button" disabled title="Pré-lançamento: ainda não é possível cadastrar pacientes">
          <UserPlus className="size-4" /> Novo paciente
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou objetivo" aria-label="Buscar paciente" className="h-10 pl-9" />
        </div>
        <div role="radiogroup" aria-label="Status" className="inline-flex rounded-lg border border-border p-1">
          {(Object.keys(STATUS) as PatientStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', status === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {STATUS[s]} ({DEMO_PATIENTS.filter((p) => p.status === s).length})
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-label="Pacientes">
          {rows.map((p) => {
            const hasFicha = p.id === 'exemplo';
            const initials = p.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
            const content = (
              <div className="flex items-center gap-4 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {p.ageYears} anos · {p.objective}
                  </p>
                </div>
                <div className="hidden flex-wrap gap-1.5 md:flex">
                  {p.tags.map((t) => (
                    <Badge key={t} variant="secondary">{t}</Badge>
                  ))}
                </div>
                <div className="hidden w-40 text-right text-sm sm:block">
                  <p className="text-muted-foreground">Última: {dateBR(p.lastVisit)}</p>
                  <p className={cn('flex items-center justify-end gap-1', p.nextVisit ? 'text-foreground' : 'text-muted-foreground')}>
                    <CalendarClock className="size-3.5" aria-hidden="true" /> {p.nextVisit ? dateBR(p.nextVisit) : 'Sem retorno'}
                  </p>
                </div>
                {hasFicha ? <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" /> : <span className="w-5" />}
              </div>
            );
            return (
              <li key={p.id}>
                {hasFicha ? (
                  <Link href={patientHref} className="block transition-colors hover:bg-muted/50">
                    {content}
                  </Link>
                ) : (
                  <div title="Ficha disponível só para a paciente de exemplo" className="opacity-80">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
