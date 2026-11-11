'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createPatient, updatePatient } from '@/lib/patients/actions';
import { patientFormSchema, type PatientFormData, type PatientFormInput } from '@/lib/patients/schema';

const EMPTY: PatientFormInput = { full_name: '', birth_date: '', sex: undefined, email: '', phone: '', cpf: '', objective: '' };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export interface PatientFormProps {
  /** Ausente = cadastro; presente = edição deste paciente. */
  patientId?: string;
  initialValues?: PatientFormInput;
  onDone: () => void;
  onCancel: () => void;
}

/** Formulário de paciente: cadastro (createPatient) ou edição (updatePatient). */
export function PatientForm({ patientId, initialValues, onDone, onCancel }: PatientFormProps) {
  const editing = Boolean(patientId);
  const prefix = editing ? 'ep' : 'np';
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<PatientFormInput, unknown, PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: initialValues ?? EMPTY,
    mode: 'onTouched',
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    // Envia o texto como digitado: a server action valida e normaliza de novo (CPF, telefone).
    const raw = form.getValues();
    startTransition(async () => {
      const r = editing ? await updatePatient(patientId!, raw) : await createPatient(raw);
      if (r.ok) {
        if (!editing) form.reset(EMPTY);
        onDone();
        return;
      }
      setServerError(r.message);
      for (const [k, msg] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof PatientFormInput, { message: msg });
    });
  });

  const field = (name: keyof PatientFormInput, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
      <Input
        id={`${prefix}-${name}`}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${prefix}-${name}-error` : undefined}
        {...form.register(name)}
        {...props}
      />
      <FieldError id={`${prefix}-${name}-error`} message={errors[name]?.message} />
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 rounded-2xl border border-border bg-card p-5" aria-label={editing ? 'Editar paciente' : 'Novo paciente'}>
      <h2 className="font-display text-xl font-semibold">{editing ? 'Editar dados' : 'Novo paciente'}</h2>
      {serverError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{field('full_name', 'Nome completo', { autoComplete: 'off', autoFocus: !editing })}</div>
        {field('birth_date', 'Data de nascimento (opcional)', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-sex`}>Sexo (opcional)</Label>
          <select
            id={`${prefix}-sex`}
            {...form.register('sex', { setValueAs: (v) => (v === '' ? undefined : v) })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Não informar</option>
            <option value="female">Feminino</option>
            <option value="male">Masculino</option>
          </select>
          <p className="text-xs text-muted-foreground">Usado nas fórmulas de gasto energético e composição corporal.</p>
        </div>
        {field('phone', 'Celular (opcional)', { type: 'tel', inputMode: 'tel', placeholder: '(31) 99999-8888' })}
        {field('email', 'E-mail (opcional)', { type: 'email', autoComplete: 'off' })}
        {field('cpf', 'CPF (opcional)', { inputMode: 'numeric', placeholder: '000.000.000-00' })}
        <div className="sm:col-span-2">{field('objective', 'Objetivo (opcional)', { placeholder: 'Ex.: emagrecimento, hipertrofia, controle glicêmico' })}</div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />} {editing ? 'Salvar alterações' : 'Salvar paciente'}
        </Button>
      </div>
    </form>
  );
}

/** Atalho para o cadastro (mantém a API usada pela lista). */
export function NewPatientForm(props: Omit<PatientFormProps, 'patientId' | 'initialValues'>) {
  return <PatientForm {...props} />;
}
