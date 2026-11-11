'use client';

import { AlertCircle, Archive, ChevronRight, Loader2, RotateCcw, Search, Sparkles, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { NewPatientForm } from '@/components/clinical/new-patient-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setPatientStatus } from '@/lib/patients/actions';
import { ageInYears, type Patient, type PatientStatus } from '@/lib/patients/schema';
import { cn } from '@/lib/utils';

const STATUS: Record<PatientStatus, string> = { active: 'Ativos', inactive: 'Inativos', archived: 'Arquivados' };
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** "+5531999998888" -> "(31) 99999-8888" */
export function formatPhoneBR(e164: string | null): string | null {
  if (!e164) return null;
  const d = e164.replace(/^\+55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

export interface PatientsListProps {
  /** null = não foi possível carregar do Directus. */
  patients: Patient[] | null;
  /** Limite de pacientes ativos do plano (null = sem limite). */
  limit: number | null;
  planName: string;
  /** Link da ficha da paciente fictícia de demonstração. */
  demoHref: string;
}

export function PatientsList({ patients, limit, planName, demoHref }: PatientsListProps) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PatientStatus>('active');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const all = useMemo(() => patients ?? [], [patients]);
  const count = (s: PatientStatus) => all.filter((p) => p.status === s).length;
  const activeCount = count('active');
  const full = limit !== null && activeCount >= limit;

  const rows = useMemo(
    () => all.filter((p) => p.status === status && (!q || norm(p.full_name).includes(norm(q)) || norm(p.objective ?? '').includes(norm(q)))),
    [all, q, status],
  );

  function changeStatus(p: Patient, next: PatientStatus) {
    setBusyId(p.id);
    setFeedback(null);
    startTransition(async () => {
      const r = await setPatientStatus(p.id, next);
      setBusyId(null);
      setFeedback(
        r.ok
          ? { kind: 'ok', text: next === 'archived' ? `${p.full_name} foi arquivado(a).` : `${p.full_name} está ativo(a) de novo.` }
          : { kind: 'error', text: r.message },
      );
    });
  }

  if (patients === null) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertDescription>Não foi possível carregar os pacientes agora. Atualize a página em instantes.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {limit !== null ? (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{activeCount} de {limit}</span> pacientes ativos no plano {planName}
              </p>
              <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${activeCount} de ${limit} pacientes ativos`}>
                <div className={cn('h-full rounded-full', full ? 'bg-tomato' : 'bg-primary')} style={{ width: `${Math.min(100, (activeCount / limit) * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{activeCount}</span> pacientes ativos
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={() => {
            setCreating(true);
            setFeedback(null);
          }}
          disabled={creating || full}
          title={full ? 'Limite de pacientes ativos do plano atingido. Arquive um paciente para liberar a vaga.' : undefined}
        >
          <UserPlus className="size-4" /> Novo paciente
        </Button>
      </div>

      {full && !creating && (
        <Alert>
          <AlertCircle />
          <AlertDescription>
            Você chegou ao limite de {limit} pacientes ativos do plano {planName}. Arquive quem não está mais em acompanhamento para liberar vagas.
          </AlertDescription>
        </Alert>
      )}

      {creating && (
        <NewPatientForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            setStatus('active');
            setFeedback({ kind: 'ok', text: 'Paciente cadastrado.' });
          }}
        />
      )}

      {feedback && (
        <p role="status" className={cn('text-sm', feedback.kind === 'ok' ? 'text-primary' : 'text-destructive')}>
          {feedback.text}
        </p>
      )}

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
              {STATUS[s]} ({count(s)})
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {all.length === 0 ? 'Nenhum paciente cadastrado ainda. Use “Novo paciente” para começar.' : 'Nenhum paciente encontrado.'}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-label="Pacientes">
          {rows.map((p) => {
            const initials = p.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
            const details = [p.birth_date ? `${ageInYears(p.birth_date)} anos` : null, p.objective, formatPhoneBR(p.phone)].filter(Boolean).join(' · ');
            return (
              <li key={p.id} className="flex items-center gap-4 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/app/pacientes/${p.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                    {p.full_name}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">{details || 'Sem dados complementares'}</p>
                </div>
                {p.status === 'archived' || p.status === 'inactive' ? (
                  <Button type="button" variant="outline" size="sm" disabled={busyId === p.id || full} onClick={() => changeStatus(p, 'active')}>
                    {busyId === p.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reativar
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" disabled={busyId === p.id} onClick={() => changeStatus(p, 'archived')} aria-label={`Arquivar ${p.full_name}`}>
                    {busyId === p.id ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />} Arquivar
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link href={demoHref} className="flex items-center gap-4 rounded-2xl border border-dashed border-border px-5 py-4 transition-colors hover:bg-muted/50">
        <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium">Paciente de exemplo (Marina Costa)</span>
          <span className="block text-muted-foreground">Veja a avaliação antropométrica e o plano alimentar com a TACO em demonstração.</span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
      </Link>
    </div>
  );
}
