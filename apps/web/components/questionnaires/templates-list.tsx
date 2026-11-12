'use client';

import { allQuestions } from '@rafanutri/forms';
import { Copy, Loader2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { duplicateTemplate } from '@/lib/questionnaires/actions';
import type { QuestionnaireTemplate } from '@/lib/questionnaires/repository';

export function TemplatesList({ templates }: { templates: QuestionnaireTemplate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function duplicate(t: QuestionnaireTemplate) {
    setBusy(t.id);
    setError(null);
    startTransition(async () => {
      const r = await duplicateTemplate(t.id);
      setBusy(null);
      if (r.ok && r.id) router.push(`/app/questionarios/${r.id}`);
      else setError(r.ok ? 'Não foi possível duplicar.' : r.message);
    });
  }

  return (
    <div className="space-y-4">
      {error && <p role="status" className="text-sm text-destructive">{error}</p>}
      <ul className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => {
          const own = Boolean(t.organization_id);
          return (
            <li key={t.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium">{t.name}</h2>
                <Badge variant={own ? 'default' : 'secondary'}>{own ? 'Do consultório' : 'Padrão'}</Badge>
              </div>
              {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {t.schema.sections.length} seção(ões) · {allQuestions(t.schema).length} perguntas{own ? ` · versão ${t.version}` : ''}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {own && (
                  <Button asChild size="sm">
                    <Link href={`/app/questionarios/${t.id}`}><Pencil className="size-4" /> Editar</Link>
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" disabled={busy === t.id} onClick={() => duplicate(t)}>
                  {busy === t.id ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} {own ? 'Duplicar' : 'Duplicar para editar'}
                </Button>
                {!own && (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/app/questionarios/${t.id}`}>Ver perguntas</Link>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
