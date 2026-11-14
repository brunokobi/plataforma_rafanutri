'use client';

import { Eye, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { saveShareSettings, type ShareConfig } from '@/lib/patient-area/actions';
import { SHARE_LABEL, type ShareSettings } from '@/lib/patient-area/types';

const KEYS = Object.keys(SHARE_LABEL) as Array<keyof ShareSettings>;

/** RN-210 — O que este paciente vê na área do paciente (com padrão do consultório). */
export function PatientShareSettings({ patientId, config }: { patientId: string; config: ShareConfig | null }) {
  const [values, setValues] = useState<ShareSettings>(config?.effective ?? { show_kcal: false, show_macros: false, show_weight_history: false });
  const [asDefault, setAsDefault] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!config) return <p className="text-sm text-destructive">Não foi possível carregar o que o paciente vê.</p>;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const r = await saveShareSettings(patientId, values, asDefault);
      setMessage(r.ok ? { ok: true, text: asDefault ? 'Salvo para este paciente e como padrão do consultório.' : 'Salvo. A área do paciente já mostra assim.' } : { ok: false, text: r.message });
    });
  }

  return (
    <section aria-labelledby="share" className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="share" className="font-display text-lg font-semibold">O que o paciente vê</h2>
        <Button asChild variant="outline" size="sm" className="ml-auto"><Link href={`/app/pacientes/${patientId}/ver-como-paciente`}><Eye className="size-4" /> Ver como paciente</Link></Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">O plano, as receitas e as recomendações sempre aparecem. Escolha o que mais o paciente vê.</p>
      <form onSubmit={save} aria-label="O que o paciente vê" className="mt-3 space-y-2">
        {KEYS.map((k) => (
          <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" role="switch" aria-checked={values[k]} checked={values[k]} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.checked }))} className="size-4" />
            {SHARE_LABEL[k]}
            {!config.overrides && <span className="text-xs text-muted-foreground">(padrão)</span>}
          </label>
        ))}
        {config.can_edit_defaults && (
          <label className="flex min-h-11 items-center gap-3 border-t border-border pt-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} className="size-4" />
            Usar também como padrão para os pacientes que ainda não têm escolha própria
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
          {message && <p role="status" className={message.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{message.text}</p>}
        </div>
      </form>
    </section>
  );
}
