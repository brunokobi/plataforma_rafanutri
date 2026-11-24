'use client';

import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { applyTemplate } from '@/lib/meal-plans/template-actions';

/** "Criar plano" a partir do modelo (rascunho já ajustado à meta), usado na pré-visualização de impressão. */
export function PlanSuggestionApply({ patientId, templateId, targetKcal }: { patientId: string; templateId: string; targetKcal: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
        setError(null);
        const r = await applyTemplate(patientId, templateId, targetKcal);
        if (r.ok && r.id) router.push(`/app/pacientes/${patientId}/planos/${r.id}`);
        else if (!r.ok) setError(r.message);
      })}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Criar plano
      </Button>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </>
  );
}
