'use client';

import { allQuestions, formatAnswer, isVisible, type AnswerValue, type Answers, type Question, type Questionnaire } from '@rafanutri/forms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const choiceClass = (on: boolean) =>
  cn('rounded-lg border px-3 py-2 text-left text-sm transition', on ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border hover:bg-muted');

function Field({ q, value, error, onChange, prefix }: { q: Question; value: AnswerValue | undefined; error?: string; onChange: (v: AnswerValue | undefined) => void; prefix: string }) {
  const id = `${prefix}-${q.id}`;
  const describedBy = [q.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const label = (
    <span>
      {q.label}
      {q.required && <span className="text-destructive" aria-hidden="true"> *</span>}
    </span>
  );
  let control: React.ReactNode;
  switch (q.type) {
    case 'text':
      control = <Input id={id} value={(value as string) ?? ''} maxLength={300} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={describedBy} />;
      break;
    case 'textarea':
      control = (
        <textarea
          id={id}
          value={(value as string) ?? ''}
          maxLength={4000}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      );
      break;
    case 'number':
      control = (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            step="any"
            min={q.min}
            max={q.max}
            value={value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value.replace(',', '.')))}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className="w-32"
          />
          {q.unit && <span className="text-sm text-muted-foreground">{q.unit}</span>}
        </div>
      );
      break;
    case 'date':
      control = <Input id={id} type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)} aria-invalid={Boolean(error)} aria-describedby={describedBy} className="w-48" />;
      break;
    case 'yesno':
      control = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="flex gap-2">
          {[[true, 'Sim'], [false, 'Não']].map(([v, l]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v as boolean)} className={choiceClass(value === v)}>
              {l as string}
            </button>
          ))}
        </div>
      );
      break;
    case 'single':
      control = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="grid gap-2 sm:grid-cols-2">
          {q.options!.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={choiceClass(value === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      );
      break;
    case 'multiple': {
      const list = Array.isArray(value) ? value : [];
      control = (
        <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="grid gap-2 sm:grid-cols-2">
          {q.options!.map((o) => {
            const on = list.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onChange(on ? list.filter((x) => x !== o.value) : [...list, o.value])}
                className={choiceClass(on)}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case 'scale': {
      const points = Array.from({ length: q.max! - q.min! + 1 }, (_, i) => q.min! + i);
      control = (
        <div>
          <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="flex flex-wrap gap-1.5">
            {points.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={value === p} onClick={() => onChange(p)} className={cn(choiceClass(value === p), 'min-w-10 text-center tabular-nums')}>
                {p}
              </button>
            ))}
          </div>
          {(q.min_label || q.max_label) && (
            <div className="mt-1 flex max-w-sm justify-between text-xs text-muted-foreground">
              <span>{q.min_label}</span>
              <span>{q.max_label}</span>
            </div>
          )}
        </div>
      );
      break;
    }
  }
  const isGroup = ['yesno', 'single', 'multiple', 'scale'].includes(q.type);
  return (
    <div className="space-y-2" data-question={q.id}>
      {isGroup ? (
        <p id={`${id}-label`} className="text-sm font-medium">{label}</p>
      ) : (
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      )}
      {q.help && <p id={`${id}-help`} className="text-xs text-muted-foreground">{q.help}</p>}
      {control}
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Renderiza o questionário (só as perguntas visíveis pelas condições). Controlado por `answers`. */
export function QuestionnaireFields({
  schema,
  answers,
  errors = {},
  onChange,
  prefix = 'q',
}: {
  schema: Questionnaire;
  answers: Answers;
  errors?: Record<string, string>;
  onChange: (next: Answers) => void;
  prefix?: string;
}) {
  const set = (id: string, v: AnswerValue | undefined) => {
    const next = { ...answers };
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete next[id];
    else next[id] = v;
    onChange(next);
  };
  return (
    <div className="space-y-8">
      {schema.sections.map((s, i) => {
        const visible = s.questions.filter((q) => isVisible(q, answers));
        if (visible.length === 0) return null;
        return (
          <section key={s.id ?? i} aria-labelledby={`${prefix}-s${i}`} className="space-y-5">
            <div>
              <h2 id={`${prefix}-s${i}`} className="font-display text-xl font-semibold">{s.title}</h2>
              {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
            </div>
            {visible.map((q) => (
              <Field key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} onChange={(v) => set(q.id, v)} prefix={prefix} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** Respostas em leitura (ficha do paciente). Mostra só as perguntas que estavam visíveis. */
export function QuestionnaireAnswers({ schema, answers }: { schema: Questionnaire; answers: Answers }) {
  const answered = allQuestions(schema).filter((q) => isVisible(q, answers));
  if (answered.length === 0) return <p className="text-sm text-muted-foreground">Sem respostas.</p>;
  return (
    <div className="space-y-6">
      {schema.sections.map((s, i) => {
        const qs = s.questions.filter((q) => isVisible(q, answers));
        if (qs.length === 0) return null;
        return (
          <section key={s.id ?? i}>
            <h3 className="font-medium">{s.title}</h3>
            <dl className="mt-2 divide-y divide-border rounded-xl border border-border">
              {qs.map((q) => (
                <div key={q.id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-sm text-muted-foreground">{q.label}</dt>
                  <dd className="whitespace-pre-wrap text-sm">{formatAnswer(q, answers[q.id])}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
