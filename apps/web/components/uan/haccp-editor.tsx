'use client';

import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Download, FileInput, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { approveHaccpPlan, createHaccpPlan, importStepsFromSheet, newHaccpVersion, saveHaccpPlan } from '@/lib/uan/haccp-actions';
import {
  answer,
  approvalIssues,
  cookingHazard,
  DECISION_LABEL,
  emptyHazard,
  HAZARD_KINDS,
  HAZARD_LABEL,
  haccpDecision,
  LEVEL_LABEL,
  MONITORING_LABEL,
  QUESTIONS,
  riskOf,
  significant,
  visibleQuestions,
  type Hazard,
  type HazardKind,
  type MonitoringKind,
  type PlanDetail,
  type Step,
  type UnitHaccp,
} from '@/lib/uan/haccp';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';
const TEXTAREA = 'min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs';
type Msg = { text: string; error?: boolean } | null;
const txt = (v: string) => (v.trim() ? v : null);
const numTxt = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
const parseNum = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Lista de planos da unidade e criação (em branco ou a partir de uma ficha técnica). */
export function HaccpList({ data }: { data: UnitHaccp }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [sheet, setSheet] = useState('');
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-6">
      {data.plans.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum plano APPCC ainda.</p> : (
        <ul aria-label="Planos APPCC" className="divide-y divide-border rounded-2xl border border-border bg-card">
          {data.plans.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0">
                <Link href={`/app/uan/appcc/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                <span className="block text-xs text-muted-foreground">v{p.version}{p.sheet_name ? ` · ficha ${p.sheet_name}` : ''} · {p.steps} etapa(s) · {p.ccps} PCC</span>
              </span>
              <Badge variant={p.status === 'approved' ? 'default' : 'secondary'}>{p.status === 'approved' ? 'Aprovado' : 'Rascunho'}</Badge>
            </li>
          ))}
        </ul>
      )}
      {data.can_edit && (
        <form aria-label="Novo plano APPCC" className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setMessage(null);
              const r = await createHaccpPlan(data.unit.id, { title, sheet_root_id: sheet || null });
              if (!r.ok) return setMessage({ text: r.message, error: true });
              router.push(`/app/uan/appcc/${r.id}`);
            });
          }}>
          <h2 className="font-semibold sm:col-span-2">Novo plano APPCC</h2>
          <div className="space-y-1.5"><Label htmlFor="hc-title">Título</Label><Input id="hc-title" maxLength={160} value={title} placeholder="APPCC — Frango assado" onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="hc-sheet">A partir da ficha técnica (opcional)</Label>
            <select id="hc-sheet" className={SELECT} value={sheet} onChange={(e) => { setSheet(e.target.value); if (!title && e.target.value) setTitle(`APPCC — ${data.sheets.find((s) => s.id === e.target.value)?.name ?? ''}`.slice(0, 160)); }}>
              <option value="">Em branco</option>
              {data.sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Criar plano</Button></div>
          {message && <p role="alert" className="text-sm text-destructive sm:col-span-2">{message.text}</p>}
        </form>
      )}
    </div>
  );
}

function DecisionBadge({ h }: { h: Hazard }) {
  const d = haccpDecision(h);
  if (!d) return significant(h) ? <Badge variant="secondary">Árvore pendente</Badge> : null;
  return <Badge variant={d === 'ccp' ? 'destructive' : 'outline'}>{d === 'ccp' && h.ccp_number ? `PCC ${h.ccp_number}` : DECISION_LABEL[d]}</Badge>;
}

/** Fluxograma: etapas em sequência, com os PCC em destaque. */
function Flowchart({ steps }: { steps: Step[] }) {
  return (
    <ol aria-label="Fluxograma" className="flex flex-col items-center gap-1">
      {steps.map((s, i) => {
        const ccps = s.hazards.filter((h) => haccpDecision(h) === 'ccp');
        return (
          <li key={i} className="flex w-full max-w-md flex-col items-center">
            {i > 0 && <ArrowDown className="size-4 text-muted-foreground" aria-hidden="true" />}
            <div className={cn('w-full rounded-xl border px-3 py-2 text-center text-sm', ccps.length ? 'border-destructive bg-destructive/5 font-semibold' : 'border-border bg-card')}>
              {i + 1}. {s.name}
              {s.target_temp !== null && <span className="text-xs font-normal text-muted-foreground"> · {numTxt(s.target_temp)} °C</span>}
              {ccps.length > 0 && <span className="ml-2 text-xs text-destructive">{ccps.map((h) => (h.ccp_number ? `PCC ${h.ccp_number}` : 'PCC')).join(', ')}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HazardForm({ h, onChange, onRemove, options, idp }: { h: Hazard; onChange: (h: Hazard) => void; onRemove: () => void; options: PlanDetail['options']; idp: string }) {
  const d = haccpDecision(h);
  const set = (patch: Partial<Hazard>) => onChange({ ...h, ...patch });
  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-3">
      <legend className="sr-only">Perigo</legend>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5"><Label htmlFor={`${idp}-kind`}>Tipo</Label>
          <select id={`${idp}-kind`} className={SELECT} value={h.kind} onChange={(e) => set({ kind: e.target.value as HazardKind })}>
            {HAZARD_KINDS.map((k) => <option key={k} value={k}>{HAZARD_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor={`${idp}-desc`}>Perigo</Label><Input id={`${idp}-desc`} maxLength={500} value={h.description} onChange={(e) => set({ description: e.target.value })} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`${idp}-cause`}>Causa</Label><Input id={`${idp}-cause`} maxLength={500} value={h.cause ?? ''} onChange={(e) => set({ cause: txt(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label htmlFor={`${idp}-sev`}>Severidade</Label>
          <select id={`${idp}-sev`} className={SELECT} value={h.severity} onChange={(e) => set({ severity: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{LEVEL_LABEL[n]}</option>)}</select>
        </div>
        <div className="space-y-1.5"><Label htmlFor={`${idp}-prob`}>Probabilidade</Label>
          <select id={`${idp}-prob`} className={SELECT} value={h.probability} onChange={(e) => set({ probability: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{LEVEL_LABEL[n]}</option>)}</select>
        </div>
        <p className="self-end text-sm">Risco <strong>{riskOf(h)}</strong> {significant(h) ? <span className="text-destructive">(significativo)</span> : <span className="text-muted-foreground">(baixo)</span>}</p>
        <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`${idp}-ctrl`}>Medida de controle</Label><Input id={`${idp}-ctrl`} maxLength={1000} value={h.control_measure ?? ''} onChange={(e) => set({ control_measure: txt(e.target.value) })} /></div>
      </div>

      <div className="space-y-2 rounded-lg bg-muted/50 p-3">
        <p className="text-sm font-medium">Árvore decisória (Codex)</p>
        {visibleQuestions(h).map((k) => (
          <div key={k} role="group" aria-label={QUESTIONS[k]} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{QUESTIONS[k]}</span>
            <span className="flex gap-1">
              {[true, false].map((v) => (
                <Button key={String(v)} type="button" size="sm" variant={h[k] === v ? 'default' : 'outline'} aria-pressed={h[k] === v} onClick={() => onChange(answer(h, k, v))}>{v ? 'Sim' : 'Não'}</Button>
              ))}
            </span>
          </div>
        ))}
        <p className="text-sm">Resultado: {d ? <strong className={d === 'ccp' ? 'text-destructive' : ''}>{DECISION_LABEL[d]}</strong> : <span className="text-muted-foreground">responda as perguntas</span>}</p>
      </div>

      {d === 'ccp' && (
        <div className="grid gap-3 rounded-lg border border-destructive/40 p-3 sm:grid-cols-3">
          <p className="text-sm font-semibold text-destructive sm:col-span-3">Ponto crítico de controle</p>
          <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`${idp}-cl`}>Limite crítico</Label><Input id={`${idp}-cl`} maxLength={300} value={h.critical_limit ?? ''} onChange={(e) => set({ critical_limit: txt(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${idp}-min`}>Mínimo</Label><Input id={`${idp}-min`} inputMode="decimal" value={numTxt(h.limit_min)} onChange={(e) => set({ limit_min: parseNum(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${idp}-max`}>Máximo</Label><Input id={`${idp}-max`} inputMode="decimal" value={numTxt(h.limit_max)} onChange={(e) => set({ limit_max: parseNum(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${idp}-unit`}>Unidade</Label><Input id={`${idp}-unit`} maxLength={20} value={h.limit_unit ?? ''} onChange={(e) => set({ limit_unit: txt(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${idp}-mk`}>Monitoramento</Label>
            <select id={`${idp}-mk`} className={SELECT} value={h.monitoring_kind ?? ''} onChange={(e) => set({ monitoring_kind: (e.target.value || null) as MonitoringKind | null })}>
              <option value="">—</option>
              {(Object.keys(MONITORING_LABEL) as MonitoringKind[]).map((k) => <option key={k} value={k}>{MONITORING_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${idp}-mw`}>O que monitorar</Label><Input id={`${idp}-mw`} maxLength={300} value={h.monitoring_what ?? ''} onChange={(e) => set({ monitoring_what: txt(e.target.value) })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${idp}-mh`}>Como</Label><Input id={`${idp}-mh`} maxLength={500} value={h.monitoring_how ?? ''} onChange={(e) => set({ monitoring_how: txt(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${idp}-mf`}>Frequência</Label><Input id={`${idp}-mf`} maxLength={120} value={h.monitoring_frequency ?? ''} onChange={(e) => set({ monitoring_frequency: txt(e.target.value) })} /></div>
          {h.monitoring_kind === 'checklist' && (
            <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`${idp}-tpl`}>Modelo de checklist</Label>
              <select id={`${idp}-tpl`} className={SELECT} value={h.checklist_template_id ?? ''} onChange={(e) => set({ checklist_template_id: e.target.value || null })}>
                <option value="">—</option>{options.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {h.monitoring_kind === 'temperature' && options.equipment.length > 0 && (
            <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`${idp}-eq`}>Equipamento (se a medição for de um equipamento)</Label>
              <select id={`${idp}-eq`} className={SELECT} value={h.equipment_id ?? ''} onChange={(e) => set({ equipment_id: e.target.value || null })}>
                <option value="">Temperatura do alimento</option>{options.equipment.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`${idp}-ca`}>Ação corretiva</Label><textarea id={`${idp}-ca`} className={TEXTAREA} maxLength={1000} value={h.corrective_action ?? ''} onChange={(e) => set({ corrective_action: txt(e.target.value) })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${idp}-ver`}>Verificação</Label><Input id={`${idp}-ver`} maxLength={500} value={h.verification ?? ''} onChange={(e) => set({ verification: txt(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${idp}-rec`}>Registro</Label><Input id={`${idp}-rec`} maxLength={300} value={h.records ?? ''} onChange={(e) => set({ records: txt(e.target.value) })} /></div>
        </div>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}><Trash2 className="size-4" /> Remover perigo</Button>
    </fieldset>
  );
}

/** Leitura de um perigo (plano aprovado). */
function HazardView({ h }: { h: Hazard }) {
  const d = haccpDecision(h);
  return (
    <li className="space-y-1 rounded-xl border border-border p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2"><Badge variant="outline">{HAZARD_LABEL[h.kind]}</Badge> <span className="font-medium">{h.description}</span> <DecisionBadge h={h} /></p>
      <p className="text-xs text-muted-foreground">Severidade {LEVEL_LABEL[h.severity]} · probabilidade {LEVEL_LABEL[h.probability]} · risco {riskOf(h)}{h.cause ? ` · causa: ${h.cause}` : ''}{h.control_measure ? ` · controle: ${h.control_measure}` : ''}</p>
      {d === 'ccp' && (
        <dl className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
          <div><dt className="inline font-semibold">Limite crítico: </dt><dd className="inline">{h.critical_limit}</dd></div>
          <div><dt className="inline font-semibold">Monitoramento: </dt><dd className="inline">{[h.monitoring_what, h.monitoring_how, h.monitoring_frequency].filter(Boolean).join(' · ')}</dd></div>
          <div><dt className="inline font-semibold">Ação corretiva: </dt><dd className="inline">{h.corrective_action}</dd></div>
          <div><dt className="inline font-semibold">Verificação: </dt><dd className="inline">{h.verification ?? '—'}</dd></div>
        </dl>
      )}
    </li>
  );
}

/** Plano: editor do rascunho (etapas, perigos, árvore e PCC) ou leitura do aprovado; aprovação; versões; PDF. */
export function HaccpEditor({ data }: { data: PlanDetail }) {
  const router = useRouter();
  const [title, setTitle] = useState(data.plan.title);
  const [scope, setScope] = useState(data.plan.scope ?? '');
  const [steps, setSteps] = useState<Step[]>(data.steps);
  const [open, setOpen] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const edit = data.can_edit;
  const update = (next: Step[]) => { setSteps(next); setDirty(true); };
  const setStep = (i: number, patch: Partial<Step>) => update(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => { const n = [...steps]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); update(n); setOpen(null); };
  const issues = approvalIssues(steps);
  const save = () => saveHaccpPlan(data.plan.id, { title, scope: scope.trim() || null, steps });
  const run = (fn: () => Promise<{ ok: boolean; message?: string; id?: string }>, done: string, after?: (id?: string) => void) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage({ text: r.message ?? 'Não foi possível concluir.', error: true });
      setMessage({ text: done });
      setDirty(false);
      if (after) after(r.id); else router.refresh();
    });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={data.plan.status === 'approved' ? 'default' : 'secondary'}>{data.plan.status === 'approved' ? `Aprovado em ${new Date(data.plan.approved_at!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : data.plan.status === 'archived' ? 'Arquivado' : 'Rascunho'}</Badge>
        <span className="text-sm text-muted-foreground">Versão {data.plan.version}{data.sheet ? ` · ficha ${data.sheet.name}` : ''}</span>
        <Button asChild size="sm" variant="outline" className="ml-auto"><a href={`/app/uan/appcc/${data.plan.id}/pdf`}><Download className="size-4" /> PDF do plano</a></Button>
      </div>

      {edit && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="pl-title">Título</Label><Input id="pl-title" maxLength={160} value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></div>
          <div className="space-y-1.5"><Label htmlFor="pl-scope">Escopo</Label><Input id="pl-scope" maxLength={2000} value={scope} placeholder="Produto, uso pretendido e público" onChange={(e) => { setScope(e.target.value); setDirty(true); }} /></div>
        </section>
      )}
      {!edit && data.plan.scope && <p className="text-sm"><strong>Escopo:</strong> {data.plan.scope}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="etapas" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="etapas" className="font-display text-xl font-semibold">Etapas e perigos</h2>
            {edit && data.sheet && (
              <Button type="button" size="sm" variant="outline" disabled={pending}
                onClick={() => { if (window.confirm('Trocar as etapas pelos passos da ficha técnica? As etapas e perigos atuais saem.')) run(() => importStepsFromSheet(data.plan.id), 'Etapas importadas da ficha.', () => window.location.reload()); }}>
                <FileInput className="size-4" /> Etapas da ficha
              </Button>
            )}
          </div>
          {steps.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma etapa. {edit ? 'Adicione as etapas do processo, do recebimento à distribuição.' : ''}</p>}
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="rounded-2xl border border-border bg-card">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                    <ChevronDown className={cn('size-4 shrink-0 transition-transform', open === i && 'rotate-180')} aria-hidden="true" />
                    <span className="font-medium">{i + 1}. {s.name || '(sem nome)'}</span>
                    <span className="text-xs text-muted-foreground">{s.hazards.length} perigo(s)</span>
                  </button>
                  <span className="flex flex-wrap gap-1">{s.hazards.map((h, j) => <DecisionBadge key={j} h={h} />)}</span>
                  {edit && (
                    <span className="flex gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label={`Subir etapa ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Descer etapa ${i + 1}`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Remover etapa ${i + 1}`} onClick={() => { if (window.confirm(`Remover a etapa "${s.name}" e os perigos dela?`)) { update(steps.filter((_, j) => j !== i)); setOpen(null); } }}><Trash2 className="size-4" /></Button>
                    </span>
                  )}
                </div>
                {open === i && (
                  <div className="space-y-3 border-t border-border p-3">
                    {edit ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                          <div className="space-y-1.5"><Label htmlFor={`st-${i}-name`}>Nome da etapa</Label><Input id={`st-${i}-name`} maxLength={160} value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label htmlFor={`st-${i}-temp`}>Temperatura-alvo (°C)</Label><Input id={`st-${i}-temp`} inputMode="decimal" value={numTxt(s.target_temp)} onChange={(e) => setStep(i, { target_temp: parseNum(e.target.value) })} /></div>
                          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`st-${i}-desc`}>Descrição</Label><Input id={`st-${i}-desc`} maxLength={1000} value={s.description ?? ''} onChange={(e) => setStep(i, { description: txt(e.target.value) })} /></div>
                        </div>
                        {s.hazards.map((h, j) => (
                          <HazardForm key={j} idp={`hz-${i}-${j}`} h={h} options={data.options}
                            onChange={(nh) => setStep(i, { hazards: s.hazards.map((x, k) => (k === j ? nh : x)) })}
                            onRemove={() => setStep(i, { hazards: s.hazards.filter((_, k) => k !== j) })} />
                        ))}
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setStep(i, { hazards: [...s.hazards, emptyHazard()] })}><Plus className="size-4" /> Perigo</Button>
                          {s.target_temp !== null && s.target_temp >= 60 && !s.hazards.some((h) => h.monitoring_kind === 'temperature') && (
                            <Button type="button" size="sm" variant="outline" onClick={() => setStep(i, { hazards: [...s.hazards, cookingHazard(s.target_temp!)] })}><Plus className="size-4" /> PCC de cocção ({numTxt(s.target_temp)} °C)</Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                        {s.hazards.length === 0 ? <p className="text-sm text-muted-foreground">Sem perigos significativos registrados.</p> : <ul className="space-y-2">{s.hazards.map((h, j) => <HazardView key={j} h={h} />)}</ul>}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
          {edit && <Button type="button" variant="outline" onClick={() => { update([...steps, { name: '', description: null, target_temp: null, hazards: [] }]); setOpen(steps.length); }}><Plus className="size-4" /> Etapa</Button>}
        </section>
        <aside aria-label="Fluxograma do processo" className="space-y-2">
          <h2 className="font-display text-xl font-semibold">Fluxograma</h2>
          {steps.length ? <Flowchart steps={steps} /> : <p className="text-sm text-muted-foreground">—</p>}
        </aside>
      </div>

      {edit && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {issues.length > 0 ? (
            <div role="note" aria-label="Pendências para aprovar" className="space-y-1 text-sm">
              <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400"><ShieldAlert className="size-4" aria-hidden="true" /> Para aprovar falta:</p>
              <ul className="list-disc pl-5 text-muted-foreground">{issues.slice(0, 8).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden="true" /> Pronto para aprovar.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => run(save, 'Plano salvo.')}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar rascunho</Button>
            {data.can_approve && (
              <Button type="button" variant="secondary" disabled={pending || issues.length > 0}
                onClick={() => { if (window.confirm('Aprovar o plano? Depois de aprovado ele não muda; para alterar, crie uma nova versão.')) run(async () => { const s = await save(); return s.ok ? approveHaccpPlan(data.plan.id) : s; }, 'Plano aprovado.', () => window.location.reload()); }}>
                <CheckCircle2 className="size-4" /> Aprovar plano
              </Button>
            )}
          </div>
          {dirty && <p className="text-xs text-muted-foreground">Há alterações não salvas.</p>}
          {!data.can_approve && <p className="text-xs text-muted-foreground">Quem aprova é o RT da unidade ou o responsável pela empresa.</p>}
        </section>
      )}
      {data.can_new_version && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => newHaccpVersion(data.plan.id), 'Nova versão criada.', (id) => router.push(`/app/uan/appcc/${id}`))}>Nova versão</Button>
      )}
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}

      {data.versions.length > 1 && (
        <section aria-labelledby="versoes" className="space-y-2">
          <h2 id="versoes" className="font-semibold">Versões</h2>
          <ul className="space-y-1 text-sm">
            {data.versions.map((v) => (
              <li key={v.id}>
                <Link href={`/app/uan/appcc/${v.id}`} className={cn('hover:underline', v.id === data.plan.id && 'font-semibold')}>v{v.version}</Link>
                <span className="text-muted-foreground"> · {v.status === 'approved' ? 'vigente' : v.status === 'archived' ? 'substituída' : 'rascunho'}{v.approved_at ? ` · aprovada em ${new Date(v.approved_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}{v.approved_by_name ? ` por ${v.approved_by_name}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
