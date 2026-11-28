'use client';

import { Archive, ArrowLeft, CalendarDays, CalendarPlus, Eye, EyeOff, Loader2, Mail, MessageCircle, Pencil, Phone, RotateCcw, Ruler, Target, Utensils } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { PatientForm } from '@/components/clinical/patient-form';
import { formatPhoneBR } from '@/components/clinical/patients-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PatientAlerts } from '@/components/patients/patient-alerts';
import { PatientDashboard } from '@/components/patients/patient-dashboard';
import type { PatientDashboard as PatientDashboardData } from '@/lib/clinical-dashboard/types';
import type { HealthAlerts } from '@/lib/anamneses/alerts';
import { localTime, MODE_LABEL, TYPE_LABEL, type Appointment } from '@/lib/appointments/schema';
import { setPatientStatus } from '@/lib/patients/actions';
import type { Assessment } from '@/lib/assessments/schema';
import type { MealPlanSummary } from '@/lib/meal-plans/schema';
import { ageInYears, formatCpf, maskCpf, toFormValues, type Patient, type PatientStatus } from '@/lib/patients/schema';
import { patientTheme } from '@/lib/modules/theme';
import { cn } from '@/lib/utils';
import { dateBR as formatDateBR } from '@/lib/format/date';

const STATUS_LABEL: Record<PatientStatus, string> = { active: 'Ativo', inactive: 'Inativo', archived: 'Arquivado' };
const SEX_LABEL = { female: 'Feminino', male: 'Masculino' } as const;

const dateBR = (iso: string, withTime = false) =>
  formatDateBR(iso, { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });

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

/** "Peso −1,5 kg e gordura −0,8 ponto desde 20/10/2026" (comparação com a avaliação anterior). */
export function variationText(latest: Assessment, previous: Assessment): string {
  const parts: string[] = [];
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±');
  const fmt = (n: number) => Math.abs(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (latest.weight_kg !== null && previous.weight_kg !== null) {
    const d = latest.weight_kg - previous.weight_kg;
    parts.push(`peso ${sign(d)}${fmt(d)} kg`);
  }
  const f1 = latest.results.body_fat_pct;
  const f0 = previous.results.body_fat_pct;
  if (f1 !== undefined && f0 !== undefined) {
    const d = f1 - f0;
    parts.push(`gordura ${sign(d)}${fmt(d)} ponto${Math.abs(d) >= 2 ? 's' : ''}`);
  }
  if (parts.length === 0) return `Sem medidas comparáveis com a avaliação de ${dateBR(previous.assessed_at)}.`;
  const text = parts.join(' e ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} desde ${dateBR(previous.assessed_at)}.`;
}

const missing = <span className="font-normal text-muted-foreground">Não informado</span>;

/** Aba materno-infantil: crianças e adolescentes (até 19 anos) e pacientes que podem estar gestantes. */
export function showsMaternal(patient: Pick<Patient, 'sex' | 'birth_date' | 'care_profile'>): boolean {
  if (patient.care_profile === 'maternal') return true;
  if (patient.sex !== 'male') return true;
  if (!patient.birth_date) return false;
  return Date.now() - Date.parse(`${patient.birth_date}T12:00:00Z`) <= 19 * 365.25 * 864e5;
}

export function PatientHeader({ patient, activeLimitReached, active, alerts = null }: { patient: Patient; activeLimitReached: boolean; active: 'resumo' | 'prontuario' | 'avaliacoes' | 'planos' | 'anamneses' | 'recomendacoes' | 'documentos' | 'materno' | 'triagens'; alerts?: HealthAlerts | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const initials = patient.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const age = patient.birth_date ? ageInYears(patient.birth_date) : null;
  const subtitle = [age !== null ? `${age} anos` : null, patient.sex ? SEX_LABEL[patient.sex] : null].filter(Boolean).join(' · ');
  const archived = patient.status !== 'active';
  // Ficha de criança com o visual infantil e de atleta com o esportivo (app/globals.css)
  const theme = patientTheme(patient, age, active);

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
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary sm:size-14">{initials}</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{patient.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {subtitle || 'Sem idade e sexo informados'}
            {theme && <span data-module-page={theme} className="module-seal ml-2 rounded-full px-2 py-0.5 text-xs font-semibold">{theme === 'sport' ? 'Perfil esportivo' : 'Perfil infantil'}</span>}
          </p>
        </div>
        <Badge variant={archived ? 'outline' : 'secondary'} data-testid="patient-status">
          {STATUS_LABEL[patient.status]}
        </Badge>
        <div className="-mx-5 flex w-[calc(100%+2.5rem)] gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          {!archived && (
            <Button asChild>
              <Link href={`/app/mensagens/${patient.id}`}>
                <MessageCircle className="size-4" /> Mensagem
              </Link>
            </Button>
          )}
          {!archived && (
            <Button asChild variant="outline">
              <Link href={`/app/agenda?paciente=${patient.id}`}>
                <CalendarPlus className="size-4" /> Marcar consulta
              </Link>
            </Button>
          )}
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
        <p role={feedback.kind === 'ok' ? 'status' : 'alert'} className={cn('text-sm', feedback.kind === 'ok' ? 'text-primary' : 'text-destructive')}>
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

      <PatientAlerts alerts={alerts} patientId={patient.id} />
      <nav aria-label="Seções do paciente" className="sticky top-14 z-20 -mx-5 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-border bg-background/95 px-5 backdrop-blur [scrollbar-width:none] sm:mx-0 sm:px-0 lg:static lg:bg-transparent lg:backdrop-blur-none">
        {(
          [
            ['resumo', 'Resumo', `/app/pacientes/${patient.id}`],
            ['prontuario', 'Prontuário', `/app/pacientes/${patient.id}/prontuario`],
            ['avaliacoes', 'Avaliações', `/app/pacientes/${patient.id}/avaliacoes`],
            ['planos', 'Plano alimentar', `/app/pacientes/${patient.id}/planos`],
            ['anamneses', 'Anamneses', `/app/pacientes/${patient.id}/anamneses`],
            ['recomendacoes', 'Recomendações', `/app/pacientes/${patient.id}/recomendacoes`],
            ['documentos', 'Documentos', `/app/pacientes/${patient.id}/documentos`],
            ...(showsMaternal(patient) ? ([['materno', 'Materno-infantil', `/app/pacientes/${patient.id}/materno-infantil`]] as const) : []),
            ['triagens', 'Triagens', `/app/pacientes/${patient.id}/triagens`],
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
  previousAssessment = null,
  publishedPlan = null,
  nextAppointment = null,
  alerts = null,
  dashboard = null,
}: {
  patient: Patient;
  activeLimitReached: boolean;
  /** Painel do paciente (números, evolução e histórico). Sem ele, a aba mostra os cartões simples. */
  dashboard?: PatientDashboardData | null;
  latestAssessment?: Assessment | null;
  previousAssessment?: Assessment | null;
  publishedPlan?: MealPlanSummary | null;
  nextAppointment?: Appointment | null;
  alerts?: HealthAlerts | null;
}) {
  const [showCpf, setShowCpf] = useState(false);
  const age = patient.birth_date ? ageInYears(patient.birth_date) : null;
  const phone = formatPhoneBR(patient.phone);
  const whatsapp = patient.phone ? `https://wa.me/${patient.phone.replace(/\D/g, '')}` : null;

  return (
    <div className="space-y-6">
      <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="resumo" alerts={alerts} />
      {dashboard && <PatientDashboard patientId={patient.id} data={dashboard} />}
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
                <a href={`mailto:${patient.email}`} className="inline-flex max-w-full items-center gap-1 hover:underline">
                  <Mail className="size-3.5 shrink-0" aria-hidden="true" /> <span className="min-w-0 break-all">{patient.email}</span>
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

        {!dashboard && (<>
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
              {previousAssessment && (
                <p className="mt-2 text-xs text-muted-foreground" data-testid="assessment-variation">
                  {variationText(latestAssessment, previousAssessment)}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma avaliação registrada ainda.</p>
          )}
          <Link href={`/app/pacientes/${patient.id}/avaliacoes`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            {latestAssessment ? 'Ver histórico e nova avaliação' : 'Registrar a primeira avaliação'}
          </Link>
        </Card>

        <Card title="Próxima consulta" icon={<CalendarDays className="size-5" />}>
          {nextAppointment ? (
            <>
              <p className="font-medium" data-testid="next-appointment">
                {new Date(nextAppointment.starts_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' })} às {localTime(nextAppointment.starts_at)}
              </p>
              <p className="text-sm text-muted-foreground">{TYPE_LABEL[nextAppointment.type]} · {MODE_LABEL[nextAppointment.mode]}</p>
              <Link href="/app/agenda" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">Abrir a agenda</Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Nenhuma consulta marcada.</p>
              {patient.status === 'active' && (
                <Link href={`/app/agenda?paciente=${patient.id}`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">Agendar a próxima</Link>
              )}
            </>
          )}
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
        </>)}
      </div>
    </div>
  );
}
