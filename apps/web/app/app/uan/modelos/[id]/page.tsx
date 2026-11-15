import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { TemplateEditor } from '@/components/uan/template-editor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/auth/session';
import { getTemplate } from '@/lib/uan/checklist-actions';
import { CATEGORY_LABEL, FREQUENCY_LABEL } from '@/lib/uan/checklists';

export const metadata: Metadata = { title: 'Modelo de checklist', robots: { index: false } };

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unidade?: string }> }) {
  const { id } = await params;
  const { unidade } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/modelos/${id}`);
  const d = await getTemplate(id);
  if (d === undefined) notFound();
  const back = unidade && /^[0-9a-f-]{36}$/i.test(unidade) ? `/app/uan/unidades/${unidade}` : '/app/uan';

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        <Link href={back} className="text-sm text-muted-foreground hover:underline">← Voltar</Link>
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o modelo agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{d.template.name}</h1>
              <p className="text-sm text-muted-foreground">
                {CATEGORY_LABEL[d.template.category]} · {FREQUENCY_LABEL[d.template.frequency_hint]} · {d.items.length} itens
                {d.template.platform && ' · modelo da biblioteca (só leitura)'}
              </p>
            </div>
            {d.can_edit ? (
              <TemplateEditor detail={d} />
            ) : (
              <ol aria-label="Itens do modelo" className="divide-y divide-border rounded-2xl border border-border bg-card">
                {d.items.map((i) => (
                  <li key={i.position} className="space-y-1 p-3 text-sm">
                    {i.section && <p className="text-xs text-muted-foreground">{i.section}</p>}
                    <p>{i.position}. {i.prompt}</p>
                    {i.critical && <Badge variant="outline">Crítico</Badge>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </main>
    </div>
  );
}
