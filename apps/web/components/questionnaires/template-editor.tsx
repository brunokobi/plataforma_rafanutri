'use client';

import { validateQuestionnaire, type Answers, type Question, type QuestionType, type Questionnaire, type Section } from '@rafanutri/forms';
import { AlertCircle, ArrowDown, ArrowUp, Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { QuestionnaireFields } from '@/components/forms/questionnaire-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteTemplate, saveTemplate } from '@/lib/questionnaires/actions';
import { cn } from '@/lib/utils';

export const TYPE_LABEL: Record<QuestionType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  number: 'Número',
  single: 'Escolha única',
  multiple: 'Múltipla escolha',
  yesno: 'Sim ou não',
  date: 'Data',
  scale: 'Escala',
};

const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

/** "Sem lactose!" → "sem_lactose" (valor de opção estável e simples). */
export function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'opcao'
  );
}

/** Opções a partir de "uma por linha"; mantém o valor das que já existiam (respostas antigas continuam válidas). */
export function optionsFromLines(lines: string, previous: Question['options'] = []) {
  const used = new Set<string>();
  return lines
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => {
      const keep = previous.find((o) => o.label === label)?.value;
      let value = keep ?? slug(label);
      let n = 2;
      while (used.has(value)) value = `${keep ?? slug(label)}_${n++}`;
      used.add(value);
      return { value, label };
    });
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const blankQuestion = (): Question => ({ id: newId(), type: 'text', label: 'Nova pergunta' });

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function QuestionEditor({
  q,
  previous,
  onChange,
  onRemove,
  onMove,
  first,
  last,
}: {
  q: Question;
  previous: Question[];
  onChange: (q: Question) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  const id = `qe-${q.id}`;
  const conditionTarget = q.show_if ? previous.find((p) => p.id === q.show_if!.question) : undefined;
  const setType = (type: QuestionType) => {
    const next: Question = { id: q.id, type, label: q.label, help: q.help, required: q.required, show_if: q.show_if };
    if (type === 'single' || type === 'multiple') next.options = q.options?.length ? q.options : [{ value: 'opcao_1', label: 'Opção 1' }, { value: 'opcao_2', label: 'Opção 2' }];
    if (type === 'scale') Object.assign(next, { min: 1, max: 5 });
    if (type === 'number') Object.assign(next, { min: q.min, max: q.max, unit: q.unit });
    onChange(next);
  };
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4" aria-label={`Pergunta: ${q.label}`} role="group">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="space-y-1">
          <Label htmlFor={`${id}-label`} className="text-xs">Enunciado</Label>
          <Input id={`${id}-label`} value={q.label} maxLength={300} onChange={(e) => onChange({ ...q, label: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-type`} className="text-xs">Tipo</Label>
          <select id={`${id}-type`} value={q.type} onChange={(e) => setType(e.target.value as QuestionType)} className={selectClass}>
            {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
      </div>
      {(q.type === 'single' || q.type === 'multiple') && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-opts`} className="text-xs">Opções (uma por linha)</Label>
          <textarea
            id={`${id}-opts`}
            rows={Math.max(3, (q.options?.length ?? 0) + 1)}
            defaultValue={(q.options ?? []).map((o) => o.label).join('\n')}
            onBlur={(e) => onChange({ ...q, options: optionsFromLines(e.target.value, q.options) })}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </div>
      )}
      {(q.type === 'number' || q.type === 'scale') && (
        <div className="grid grid-cols-3 gap-3">
          {(['min', 'max'] as const).map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`${id}-${k}`} className="text-xs">{k === 'min' ? 'Mínimo' : 'Máximo'}</Label>
              <Input id={`${id}-${k}`} type="number" value={q[k] ?? ''} onChange={(e) => onChange({ ...q, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
          ))}
          {q.type === 'number' && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-unit`} className="text-xs">Unidade</Label>
              <Input id={`${id}-unit`} value={q.unit ?? ''} maxLength={20} placeholder="kg, h…" onChange={(e) => onChange({ ...q, unit: e.target.value || undefined })} />
            </div>
          )}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`${id}-help`} className="text-xs">Ajuda (opcional)</Label>
        <Input id={`${id}-help`} value={q.help ?? ''} maxLength={500} onChange={(e) => onChange({ ...q, help: e.target.value || undefined })} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(q.required)} onChange={(e) => onChange({ ...q, required: e.target.checked || undefined })} /> Obrigatória
        </label>
        <div className="space-y-1">
          <Label htmlFor={`${id}-cond`} className="text-xs">Mostrar só se…</Label>
          <select
            id={`${id}-cond`}
            value={q.show_if?.question ?? ''}
            onChange={(e) => {
              const target = previous.find((p) => p.id === e.target.value);
              if (!target) return onChange({ ...q, show_if: undefined });
              const firstValue = target.type === 'yesno' ? true : target.options?.[0]?.value ?? '';
              onChange({ ...q, show_if: target.type === 'multiple' ? { question: target.id, includes: String(firstValue) } : { question: target.id, equals: firstValue } });
            }}
            className={cn(selectClass, 'w-56')}
          >
            <option value="">Sempre mostrar</option>
            {previous.filter((p) => ['yesno', 'single', 'multiple'].includes(p.type)).map((p) => (
              <option key={p.id} value={p.id}>{p.label.slice(0, 50)}</option>
            ))}
          </select>
        </div>
        {conditionTarget && q.show_if && (
          <div className="space-y-1">
            <Label htmlFor={`${id}-condv`} className="text-xs">{conditionTarget.type === 'multiple' ? 'contém' : 'for igual a'}</Label>
            <select
              id={`${id}-condv`}
              value={String('includes' in q.show_if ? q.show_if.includes : q.show_if.equals)}
              onChange={(e) => {
                const v = e.target.value;
                if (conditionTarget.type === 'yesno') onChange({ ...q, show_if: { question: conditionTarget.id, equals: v === 'true' } });
                else if (conditionTarget.type === 'multiple') onChange({ ...q, show_if: { question: conditionTarget.id, includes: v } });
                else onChange({ ...q, show_if: { question: conditionTarget.id, equals: v } });
              }}
              className={cn(selectClass, 'w-48')}
            >
              {conditionTarget.type === 'yesno'
                ? [['true', 'Sim'], ['false', 'Não']].map(([v, l]) => <option key={v} value={v}>{l}</option>)
                : (conditionTarget.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Subir pergunta" disabled={first} onClick={() => onMove(-1)}><ArrowUp className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Descer pergunta" disabled={last} onClick={() => onMove(1)}><ArrowDown className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remover pergunta ${q.label}`} onClick={onRemove}><Trash2 className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}

export function TemplateEditor({ id, initial }: { id: string; initial: { name: string; description: string | null; schema: Questionnaire } }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [schema, setSchema] = useState<Questionnaire>(initial.schema);
  const [preview, setPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const setSection = (i: number, s: Section) => setSchema((cur) => ({ ...cur, sections: cur.sections.map((x, j) => (j === i ? s : x)) }));
  const allBefore = (si: number, qi: number) => [...schema.sections.slice(0, si).flatMap((s) => s.questions), ...schema.sections[si]!.questions.slice(0, qi)];

  function save() {
    setMessage(null);
    const local = validateQuestionnaire(schema);
    setProblems(local);
    if (local.length) return setMessage({ kind: 'error', text: 'Revise o questionário antes de salvar.' });
    startTransition(async () => {
      const r = await saveTemplate(id, { name, description, schema });
      if (r.ok) {
        setMessage({ kind: 'ok', text: 'Modelo salvo. Anamneses já enviadas continuam com as perguntas originais.' });
        router.refresh();
      } else {
        setProblems(r.problems ?? []);
        setMessage({ kind: 'error', text: r.message });
      }
    });
  }

  function remove() {
    if (!window.confirm('Apagar este modelo? Anamneses já enviadas não são afetadas.')) return;
    startTransition(async () => {
      const r = await deleteTemplate(id);
      if (r.ok) router.push('/app/questionarios');
      else setMessage({ kind: 'error', text: r.message });
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name">Nome do modelo</Label>
          <Input id="tpl-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-desc">Descrição (opcional)</Label>
          <Input id="tpl-desc" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Modo" className="inline-flex rounded-lg border border-border p-1">
          {[[false, 'Editar', Pencil], [true, 'Pré-visualizar', Eye]].map(([v, l, Icon]) => {
            const I = Icon as typeof Pencil;
            return (
              <button key={String(v)} type="button" role="radio" aria-checked={preview === v} onClick={() => setPreview(v as boolean)} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', preview === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <I className="size-4" /> {l as string}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>Apagar modelo</Button>
          <Button type="button" onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar modelo</Button>
        </div>
      </div>

      {message && <p role="status" className={cn('text-sm', message.kind === 'ok' ? 'text-primary' : 'text-destructive')}>{message.text}</p>}
      {problems.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            <ul className="list-disc pl-4">{problems.slice(0, 10).map((p) => <li key={p}>{p}</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}

      {preview ? (
        <div className="rounded-2xl border border-border p-5">
          <p className="mb-6 text-sm text-muted-foreground">Assim o paciente vê o formulário (as condições funcionam ao vivo; nada é salvo).</p>
          <QuestionnaireFields schema={schema} answers={previewAnswers} onChange={setPreviewAnswers} prefix="pv" />
        </div>
      ) : (
        <div className="space-y-6">
          {schema.sections.map((s, si) => (
            <section key={si} className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-label={`Seção ${si + 1}`}>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1 space-y-1">
                  <Label htmlFor={`sec-${si}`} className="text-xs">Título da seção</Label>
                  <Input id={`sec-${si}`} value={s.title} maxLength={120} onChange={(e) => setSection(si, { ...s, title: e.target.value })} />
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label="Subir seção" disabled={si === 0} onClick={() => setSchema((c) => ({ ...c, sections: move(c.sections, si, si - 1) }))}><ArrowUp className="size-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Descer seção" disabled={si === schema.sections.length - 1} onClick={() => setSchema((c) => ({ ...c, sections: move(c.sections, si, si + 1) }))}><ArrowDown className="size-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remover seção ${s.title}`} disabled={schema.sections.length === 1} onClick={() => setSchema((c) => ({ ...c, sections: c.sections.filter((_, j) => j !== si) }))}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              {s.questions.map((q, qi) => (
                <QuestionEditor
                  key={q.id}
                  q={q}
                  previous={allBefore(si, qi)}
                  first={qi === 0}
                  last={qi === s.questions.length - 1}
                  onChange={(nq) => setSection(si, { ...s, questions: s.questions.map((x, j) => (j === qi ? nq : x)) })}
                  onRemove={() => setSection(si, { ...s, questions: s.questions.filter((_, j) => j !== qi) })}
                  onMove={(d) => setSection(si, { ...s, questions: move(s.questions, qi, qi + d) })}
                />
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setSection(si, { ...s, questions: [...s.questions, blankQuestion()] })}>
                <Plus className="size-4" /> Pergunta
              </Button>
            </section>
          ))}
          <Button type="button" variant="outline" onClick={() => setSchema((c) => ({ ...c, sections: [...c.sections, { title: 'Nova seção', questions: [blankQuestion()] }] }))}>
            <Plus className="size-4" /> Seção
          </Button>
        </div>
      )}
    </div>
  );
}
