'use client';

import { AlertCircle, BookmarkPlus, CopyPlus, FileText, Info, LibraryBig, Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createMealPlan, deleteMealPlanDraft } from '@/lib/meal-plans/actions';
import { applyTemplate, saveAsTemplate } from '@/lib/meal-plans/template-actions';
import { STATUS_LABEL, type MealPlanSummary } from '@/lib/meal-plans/schema';
import { cn } from '@/lib/utils';
import { dateBR as formatDateBR } from '@/lib/format/date';

const dateBR = (iso: string) => formatDateBR(iso);

export interface PlanTemplateOption {
  id: string;
  name: string;
  energy_kcal: number | null;
  own: boolean;
}

const fmtKcal = (n: number) => Math.round(n).toLocaleString('pt-BR');

function SaveAsTemplateForm({ patientId, plan, onDone, onCancel }: { patientId: string; plan: MealPlanSummary; onDone: (msg: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(plan.title);
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-label={`Salvar ${plan.title} como modelo`}
      className="mt-3 grid w-full gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await saveAsTemplate(patientId, plan.id, { name, tags });
          if (r.ok) onDone(`Modelo "${name}" salvo. Use em outros pacientes pela opção "Novo a partir de modelo".`);
          else setError(r.message);
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`tn-${plan.id}`} className="text-xs">Nome do modelo</Label>
        <Input id={`tn-${plan.id}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`tt-${plan.id}`} className="text-xs">Etiquetas (separe por vírgula)</Label>
        <Input id={`tt-${plan.id}`} value={tags} placeholder="emagrecimento, low carb" onChange={(e) => setTags(e.target.value)} />
      </div>
      <div className="flex items-end gap-1">
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar modelo</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-3">{error}</p>}
    </form>
  );
}

function FromTemplate({ patientId, templates, onError }: { patientId: string; templates: PlanTemplateOption[]; onError: (m: string) => void }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const selected = templates.find((t) => t.id === templateId);
  const [scale, setScale] = useState(false);
  const [target, setTarget] = useState<number>(selected?.energy_kcal ? Math.round(selected.energy_kcal) : 1800);
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="novo-de-modelo" className="rounded-2xl border border-border bg-card p-4">
      <h3 id="novo-de-modelo" className="flex items-center gap-2 font-medium"><LibraryBig className="size-4" /> Novo a partir de modelo</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="pt-template" className="text-xs">Modelo</Label>
          <select
            id="pt-template"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              const t = templates.find((x) => x.id === e.target.value);
              if (t?.energy_kcal) setTarget(Math.round(t.energy_kcal));
            }}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.energy_kcal ? ` · ${fmtKcal(t.energy_kcal)} kcal` : ''}{t.own ? '' : ' (biblioteca)'}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={scale} disabled={!selected?.energy_kcal} onChange={(e) => setScale(e.target.checked)} /> Ajustar à meta
        </label>
        {scale && (
          <div className="space-y-1">
            <Label htmlFor="pt-target" className="text-xs">Meta (kcal/dia)</Label>
            <Input id="pt-target" type="number" min={600} max={6000} step={50} value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)} className="w-32" />
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={pending || !templateId}
          onClick={() =>
            startTransition(async () => {
              const r = await applyTemplate(patientId, templateId, scale ? target : null);
              if (r.ok && r.id) router.push(`/app/pacientes/${patientId}/planos/${r.id}`);
              else if (!r.ok) onError(r.message);
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Criar rascunho
        </Button>
      </div>
      {scale && selected?.energy_kcal ? (
        <p className="mt-2 text-xs text-muted-foreground">
          As quantidades do modelo ({fmtKcal(selected.energy_kcal)} kcal) serão multiplicadas por {(target / selected.energy_kcal).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} e arredondadas (de 5 em 5 g; abaixo de 20 g, de 1 em 1 g).
        </p>
      ) : null}
    </section>
  );
}

export function PatientPlans({ patientId, plans, templates = [] }: { patientId: string; plans: MealPlanSummary[] | null | 'unavailable'; templates?: PlanTemplateOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const list = Array.isArray(plans) ? plans : [];

  function create(fromPlanId?: string) {
    setError(null);
    setBusy(fromPlanId ?? 'new');
    startTransition(async () => {
      const r = await createMealPlan(patientId, fromPlanId);
      setBusy(null);
      if (r.ok && r.id) router.push(`/app/pacientes/${patientId}/planos/${r.id}`);
      else if (!r.ok) setError(r.message);
    });
  }

  function remove(planId: string) {
    if (!window.confirm('Apagar este rascunho? Esta ação não pode ser desfeita.')) return;
    setError(null);
    setBusy(planId);
    startTransition(async () => {
      const r = await deleteMealPlanDraft(patientId, planId);
      setBusy(null);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }

  if (plans === 'unavailable') {
    return (
      <Alert>
        <Info />
        <AlertTitle>Planos por paciente em ativação</AlertTitle>
        <AlertDescription>
          <p>O servidor ainda não está liberado para salvar planos alimentares. Enquanto isso, use o editor de demonstração com a TACO.</p>
          <Link href="/app/pacientes/exemplo/plano" className="mt-2 inline-block font-medium text-primary hover:underline">Abrir o editor de demonstração</Link>
        </AlertDescription>
      </Alert>
    );
  }
  if (plans === null) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertDescription>Não foi possível carregar os planos agora. Atualize a página em instantes.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Só um plano fica publicado por vez. Publicar um novo arquiva o anterior; publicados não são editados, crie uma nova versão.
        </p>
        <Button type="button" onClick={() => create()} disabled={busy !== null}>
          {busy === 'new' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Novo plano
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      {templates.length > 0 && <FromTemplate patientId={patientId} templates={templates} onError={setError} />}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum plano criado ainda.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-label="Planos alimentares">
          {list.map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <FileText className={cn('size-5 shrink-0', plan.status === 'published' ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link href={`/app/pacientes/${patientId}/planos/${plan.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                  {plan.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {plan.status === 'published' && plan.published_at
                    ? `Publicado em ${dateBR(plan.published_at)}${plan.valid_until ? ` · válido até ${dateBR(plan.valid_until)}` : ''}`
                    : `Criado em ${dateBR(plan.date_created)}`}
                  {plan.totals?.energy_kcal ? ` · ${Math.round(plan.totals.energy_kcal).toLocaleString('pt-BR')} kcal/dia` : ''}
                </p>
              </div>
              <Badge variant={plan.status === 'published' ? 'default' : plan.status === 'draft' ? 'secondary' : 'outline'}>{STATUS_LABEL[plan.status]}</Badge>
              <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => { setSaving(saving === plan.id ? null : plan.id); setNotice(null); }} aria-expanded={saving === plan.id}>
                <BookmarkPlus className="size-4" /> Salvar como modelo
              </Button>
              {plan.status === 'draft' ? (
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => remove(plan.id)} aria-label={`Apagar rascunho ${plan.title}`}>
                  {busy === plan.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Apagar
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => create(plan.id)}>
                  {busy === plan.id ? <Loader2 className="size-4 animate-spin" /> : <CopyPlus className="size-4" />} Nova versão
                </Button>
              )}
              {saving === plan.id && (
                <SaveAsTemplateForm
                  patientId={patientId}
                  plan={plan}
                  onCancel={() => setSaving(null)}
                  onDone={(msg) => {
                    setSaving(null);
                    setNotice(msg);
                    router.refresh();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
