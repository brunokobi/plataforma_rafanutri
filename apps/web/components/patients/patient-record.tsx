'use client';

import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  RotateCcw,
  Ruler,
  Target,
  Utensils,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { PatientForm } from '@/components/clinical/patient-form';
import { formatPhoneBR } from '@/components/clinical/patients-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { setPatientStatus } from '@/lib/patients/actions';
import type { Assessment } from '@/lib/assessments/schema';
import type { MealPlanSummary } from '@/lib/meal-plans/schema';
import { ageInYears, formatCpf, maskCpf, toFormValues, type Patient, type PatientStatus } from '@/lib/patients/schema';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<PatientStatus, string> = { active: 'Ativo', inactive: 'Inativo', archived: 'Arquivado' };
const SEX_LABEL = { female: 'Feminino', male: 'Masculino' } as const;

const dateBR = (iso: string, withTime = false) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });

function Card({ title, icon, children, className }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="text-primary">{icon}</span> {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

const missing = <span className="font-normal text-muted-foreground">Não informado</span>;

export function PatientHeader({ patient, activeLimitReached, active }: { patient: Patient; activeLimitReached: boolean; active: 'resumo' | 'avaliacoes' | 'planos' }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const initials = patient.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const age = patient.birth_date ? ageInYears(patient.birth_date) : null;
  const subtitle = [age !== null ? `${age} anos` : null, patient.sex ? SEX_LABEL[patient.sex] : null].filter(Boolean).join(' · ');
  const archived = patient.status !== 'active';

  function changeStatus(next: PatientStatus) {
    setFeedback(null);
    startTransition(async () => {
      const r = await setPatientStatus(patient.id, next);
      if (r.ok) {
        setFeedback({ kind: 'ok', text: next === 'active' ? 'Paciente reativado(a).' : 'Paciente arquivado(a).' });
        router.refresh();
      } else {
        setFeedback({ kind: 'error', text: r.message });
      }
    });
  }

  return (
    <div className="space-y-6">
      <Link href="/app/pacientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar aos pacientes
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary">{initials}</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{patient.full_name}</h1>
          <p className="text-sm text-muted-foreground">{subtitle || 'Sem idade e sexo informados'}</p>
        </div>
        <Badge variant={archived ? 'outline' : 'secondary'} data-testid="patient-status">
          {STATUS_LABEL[patient.status]}
        </Badge>
        <div className="flex flex-wrap gap-2">
          {!editing && (
            <Button type="button" variant="outline" onClick={() => { setEditing(true); setFeedback(null); }}>
              <Pencil className="size-4" /> Editar dados
            </Button>
          )}
          {archived ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending || activeLimitReached}
              title={activeLimitReached ? 'Limite de pacientes ativos do plano atingido.' : undefined}
              onClick={() => changeStatus('active')}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reativar
            </Button>
          ) : (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => changeStatus('archived')}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />} Arquivar
            </Button>
          )}
        </div>
      </div>

      {feedback && (
        <p role="status" className={cn('text-sm', feedback.kind === 'ok' ? 'text-primary' : 'text-destructive')}>
          {feedback.text}
        </p>
      )}

      {editing && (
        <PatientForm
          patientId={patient.id}
          initialValues={toFormValues(patient)}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            setFeedback({ kind: 'ok', text: 'Dados atualizados.' });
            router.refresh();
          }}
        />
      )}

      <nav aria-label="Seções do paciente" className="-mx-5 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-border px-5 sm:mx-0 sm:px-0">
        {(
          [
            ['resumo', 'Resumo', `/app/pacientes/${patient.id}`],
            ['avaliacoes', 'Avaliações', `/app/pacientes/${patient.id}/avaliacoes`],
            ['planos', 'Plano alimentar', `/app/pacientes/${patient.id}/planos`],
          ] as const
        ).map(([key, label, href]) => (
          <Link
            key={key}
            href={href}
            aria-current={active === key ? 'page' : undefined}
            className={cn('border-b-2 px-4 py-2.5 text-sm font-medium', active === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PatientRecord({
  patient,
  activeLimitReached,
  latestAssessment = null,
  publishedPlan = null,
}: {
  patient: Patient;
  activeLimitReached: boolean;
  latestAssessment?: Assessment | null;
  publishedPlan?: MealPlanSummary | null;
}) {
  const [showCpf, setShowCpf] = useState(false);
  const age = patient.birth_date ? ageInYears(patient.birth_date) : null;
  const phone = formatPhoneBR(patient.phone);
  const whatsapp = patient.phone ? `https://wa.me/${patient.phone.replace(/\D/g, '')}` : null;

  return (
    <div className="space-y-6">
      <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="resumo" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Dados pessoais" icon={<CalendarDays className="size-5" />} className="lg:col-span-2">
          <dl className="divide-y divide-border">
            <Row label="Nascimento">{patient.birth_date ? `${dateBR(patient.birth_date)} (${age} anos)` : missing}</Row>
            <Row label="Sexo">{patient.sex ? SEX_LABEL[patient.sex] : missing}</Row>
            <Row label="Celular">
              {phone ? (
                <span className="flex flex-wrap items-center gap-3">
                  <a href={`tel:${patient.phone}`} className="inline-flex items-center gap-1 hover:underline">
                    <Phone className="size-3.5" aria-hidden="true" /> {phone}
                  </a>
                  {whatsapp && (
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <MessageCircle className="size-3.5" aria-hidden="true" /> WhatsApp
                    </a>
                  )}
                </span>
              ) : (
                missing
              )}
            </Row>
            <Row label="E-mail">
              {patient.email ? (
                <a href={`mailto:${patient.email}`} className="inline-flex items-center gap-1 hover:underline">
                  <Mail className="size-3.5" aria-hidden="true" /> {patient.email}
                </a>
              ) : (
                missing
              )}
            </Row>
            <Row label="CPF">
              {patient.cpf ? (
                <span className="inline-flex items-center gap-2">
                  <span className="tabular-nums" data-testid="patient-cpf">{showCpf ? formatCpf(patient.cpf) : maskCpf(patient.cpf)}</span>
                  <button
                    type="button"
                    onClick={() => setShowCpf((v) => !v)}
                    aria-label={showCpf ? 'Ocultar CPF' : 'Mostrar CPF'}
                    aria-pressed={showCpf}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {showCpf ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              ) : (
                missing
              )}
            </Row>
          </dl>
        </Card>

        <Card title="Objetivo" icon={<Target className="size-5" />}>
          <p className={cn('text-sm', !patient.objective && 'text-muted-foreground')}>{patient.objective || 'Nenhum objetivo registrado.'}</p>
          <dl className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <div>Cadastrado em {dateBR(patient.created_at)}</div>
            {patient.updated_at && <div>Atualizado em {dateBR(patient.updated_at, true)}</div>}
          </dl>
        </Card>

        <Card title="Avaliações" icon={<Ruler className="size-5" />}>
          {latestAssessment ? (
            <>
              <p className="text-xs text-muted-foreground">Última em {dateBR(latestAssessment.assessed_at)}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Peso', latestAssessment.weight_kg !== null ? `${latestAssessment.weight_kg.toLocaleString('pt-BR')} kg` : '—'],
                  ['IMC', latestAssessment.results.bmi !== undefined ? latestAssessment.results.bmi.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'],
                  ['Gordura', latestAssessment.results.body_fat_pct !== undefined ? `${latestAssessment.results.body_fat_pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-muted/60 p-2">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="text-sm font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma avaliação registrada ainda.</p>
          )}
          <Link href={`/app/pacientes/${patient.id}/avaliacoes`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            {latestAssessment ? 'Ver histórico e nova avaliação' : 'Registrar a primeira avaliação'}
          </Link>
        </Card>

        <Card title="Plano alimentar" icon={<Utensils className="size-5" />} className="lg:col-span-2">
          {publishedPlan ? (
            <>
              <p className="font-medium">{publishedPlan.title}</p>
              <p className="text-sm text-muted-foreground">
                {publishedPlan.published_at ? `Publicado em ${dateBR(publishedPlan.published_at)}` : 'Publicado'}
                {publishedPlan.valid_until ? ` · válido até ${dateBR(publishedPlan.valid_until)}` : ''}
                {publishedPlan.totals?.energy_kcal ? ` · ${Math.round(publishedPlan.totals.energy_kcal).toLocaleString('pt-BR')} kcal/dia` : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum plano publicado.</p>
          )}
          <Link href={`/app/pacientes/${patient.id}/planos`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            {publishedPlan ? 'Ver planos e versões' : 'Criar ou continuar um plano'}
          </Link>
        </Card>
      </div>
    </div>
  );
}
