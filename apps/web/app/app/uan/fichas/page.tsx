import { AlertCircle, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { NewSheet } from '@/components/uan/new-sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getCurrentUser } from '@/lib/auth/session';
import { brl } from '@/lib/uan/catalog';
import { getSheets } from '@/lib/uan/sheet-actions';
import { SHEET_CATEGORY_LABEL, SHEET_STATUS_LABEL } from '@/lib/uan/techsheets';

export const metadata: Metadata = { title: 'Fichas técnicas', robots: { index: false } };

export default async function SheetsPage({ searchParams }: { searchParams: Promise<{ empresa?: string; q?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan');
  const data = await getSheets(sp.empresa ?? '', sp.q ?? '');
  if (data === undefined) notFound();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← UAN e Qualidade</Link>
        {data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar as fichas agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Fichas técnicas</h1>
              <p className="text-sm text-muted-foreground">{data.organization.name} · <Link href={`/app/uan/insumos?empresa=${data.organization.id}`} className="underline">Insumos</Link></p>
            </div>
            {data.can_edit && <NewSheet orgId={data.organization.id} />}
            <form role="search" className="relative max-w-md" action="/app/uan/fichas">
              <input type="hidden" name="empresa" value={data.organization.id} />
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
              <Input name="q" defaultValue={sp.q ?? ''} aria-label="Buscar ficha" placeholder="Buscar ficha" className="pl-8" />
            </form>
            {data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ficha {sp.q ? 'encontrada' : 'cadastrada ainda'}.</p>
            ) : (
              <ul aria-label="Fichas técnicas" className="divide-y divide-border rounded-2xl border border-border bg-card">
                {data.items.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span>
                      <Link href={`/app/uan/fichas/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                      <span className="block text-xs text-muted-foreground">{SHEET_CATEGORY_LABEL[s.category]} · {s.servings} porções · {s.item_count} ingrediente(s) · v{s.version}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {data.can_see_cost && s.cost_per_serving_cents !== null && <span className="tabular-nums text-muted-foreground">{brl(s.cost_per_serving_cents)}/porção</span>}
                      <Badge variant={s.status === 'approved' ? 'default' : 'secondary'}>{SHEET_STATUS_LABEL[s.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
