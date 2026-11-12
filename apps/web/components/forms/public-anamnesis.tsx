'use client';

import { validateAnswers, type Answers } from '@rafanutri/forms';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { QuestionnaireFields } from '@/components/forms/questionnaire-fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { savePublicAnamnesis, type PublicAnamnesis } from '@/lib/anamneses/public';

export function PublicAnamnesisForm({ token, data }: { token: string; data: PublicAnamnesis }) {
  const [answers, setAnswers] = useState<Answers>(data.answers ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<'draft' | 'final' | null>(null);

  function save(final: boolean) {
    setMessage(null);
    if (final) {
      const check = validateAnswers(data.schema, answers);
      setErrors(check.errors);
      if (!check.ok) {
        setMessage({ kind: 'error', text: 'Faltam respostas obrigatórias ou há respostas a corrigir (destacadas abaixo).' });
        const first = Object.keys(check.errors)[0];
        if (first) document.querySelector(`[data-question="${first}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    setAction(final ? 'final' : 'draft');
    startTransition(async () => {
      const r = await savePublicAnamnesis(token, answers, final);
      setAction(null);
      if (r.ok) {
        if (r.status === 'answered') setDone(true);
        else setMessage({ kind: 'ok', text: 'Rascunho salvo. Você pode voltar a este link para terminar depois.' });
        return;
      }
      if (r.gone) setGone(true);
      setErrors(r.fields ?? {});
      setMessage({ kind: 'error', text: r.message });
    });
  }

  if (done) {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Respostas enviadas. Obrigado{data.patient_first_name ? `, ${data.patient_first_name}` : ''}!</AlertTitle>
        <AlertDescription>{data.professional?.name ?? 'Seu nutricionista'} vai ler tudo antes da consulta. Você já pode fechar esta página.</AlertDescription>
      </Alert>
    );
  }
  if (gone) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Link indisponível</AlertTitle>
        <AlertDescription>Este link não está mais disponível. Peça um novo ao seu nutricionista.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
      className="space-y-8"
      aria-label={data.title ?? 'Anamnese'}
    >
      <QuestionnaireFields schema={data.schema} answers={answers} errors={errors} onChange={setAnswers} prefix="pa" />
      {message && (
        <p role="status" className={message.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      )}
      <div className="sticky bottom-0 -mx-5 flex flex-wrap justify-end gap-2 border-t border-border bg-background/90 px-5 py-3 backdrop-blur">
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
          {action === 'draft' && <Loader2 className="size-4 animate-spin" />} Salvar e continuar depois
        </Button>
        <Button type="submit" disabled={pending}>
          {action === 'final' && <Loader2 className="size-4 animate-spin" />} Enviar respostas
        </Button>
      </div>
    </form>
  );
}
