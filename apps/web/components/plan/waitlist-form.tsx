'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { joinWaitlist, type PaidPlan } from '@/lib/plan/actions';

const OPTIONS: Array<{ value: PaidPlan; label: string; hint: string }> = [
  { value: 'essential', label: 'Essencial', hint: 'Nutricionista autônomo, sem limite de pacientes' },
  { value: 'professional', label: 'Profissional', hint: 'Consultório com volume, gestão e automações' },
  { value: 'clinic', label: 'Clínica', hint: 'Equipes com vários nutricionistas' },
];

export function WaitlistForm({ registeredAt, initialPlan, canRegister }: { registeredAt: string | null; initialPlan: PaidPlan | null; canRegister: boolean }) {
  const [plan, setPlan] = useState<PaidPlan | null>(initialPlan);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(registeredAt);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canRegister) return <p className="text-sm text-muted-foreground">Só o responsável pelo consultório pode registrar o interesse no plano pago.</p>;

  return (
    <form
      aria-label="Quero o plano pago"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const r = await joinWaitlist(plan, note);
          if (r.ok) setDone(new Date().toISOString());
          else setMessage(r.message);
        });
      }}
    >
      {done && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="size-4 shrink-0" /> Interesse registrado em {new Date(done).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Avisaremos você quando o plano pago abrir.
        </p>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Qual plano faz sentido para você?</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="desired_plan" value={o.value} checked={plan === o.value} onChange={() => setPlan(o.value)} className="mt-1 size-4 accent-[var(--primary)]" />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="wl-note">O que você mais precisa? (opcional)</Label>
        <textarea id="wl-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-input bg-transparent p-3 text-sm" placeholder="Ex.: mais pacientes, agenda com lembretes, financeiro" />
      </div>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} {done ? 'Atualizar interesse' : 'Quero o plano pago'}</Button>
    </form>
  );
}
