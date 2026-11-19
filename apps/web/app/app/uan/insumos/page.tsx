import { AlertCircle, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { NewIngredient } from '@/components/uan/catalog-forms';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/session';
import { getUanContext } from '@/lib/uan/actions';
import { getIngredients } from '@/lib/uan/catalog-actions';
import { brl, CATEGORY_LABEL, perKg, UNIT_LABEL, type IngredientCategory } from '@/lib/uan/catalog';

export const metadata: Metadata = { title: 'Insumos', robots: { index: false } };

export default async function IngredientsPage({ searchParams }: { searchParams: Promise<{ empresa?: string; q?: string; categoria?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan');
  const category = (Object.keys(CATEGORY_LABEL) as IngredientCategory[]).find((c) => c === sp.categoria) ?? '';
  // Vindo do menu (sem empresa): abre na primeira empresa com UAN da pessoa.
  if (!sp.empresa) {
    const orgs = await getUanContext();
    redirect(orgs?.[0] ? `/app/uan/insumos?empresa=${orgs[0].id}` : '/app/uan');
  }
  const data = await getIngredients(sp.empresa ?? '', sp.q ?? '', category);
  if (data === undefined) notFound();
  const href = (cat: string) => {
    const q = new URLSearchParams({ empresa: sp.empresa ?? '' });
    if (sp.q) q.set('q', sp.q);
    if (cat) q.set('categoria', cat);
    return `/app/uan/insumos?${q}`;
  };
  const chip = (on: boolean) => cn('rounded-full border px-3 py-1 text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted');

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← UAN e Qualidade</Link>
        {data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar os insumos agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Insumos</h1>
              <p className="text-sm text-muted-foreground">{data.organization.name} · <Link href={`/app/uan/fornecedores?empresa=${data.organization.id}`} className="underline">Fornecedores</Link></p>
            </div>
            {data.can_manage && <NewIngredient orgId={data.organization.id} />}
            <form role="search" className="relative max-w-md" action="/app/uan/insumos">
              <input type="hidden" name="empresa" value={data.organization.id} />
              {category && <input type="hidden" name="categoria" value={category} />}
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
              <Input name="q" defaultValue={sp.q ?? ''} aria-label="Buscar insumo" placeholder="Buscar insumo" className="pl-8" />
            </form>
            <nav aria-label="Categorias" className="flex flex-wrap gap-2">
              <Link href={href('')} className={chip(!category)} aria-current={!category ? 'page' : undefined}>Todas</Link>
              {(Object.keys(CATEGORY_LABEL) as IngredientCategory[]).map((c) => (
                <Link key={c} href={href(c)} className={chip(category === c)} aria-current={category === c ? 'page' : undefined}>{CATEGORY_LABEL[c]}</Link>
              ))}
            </nav>
            {data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum insumo {sp.q || category ? 'encontrado' : 'cadastrado ainda'}.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Insumos de {data.organization.name}</caption>
                  <thead><tr className="text-muted-foreground"><th className="p-3 font-medium">Insumo</th><th className="p-3 font-medium">Categoria</th><th className="p-3 text-right font-medium">Preço vigente</th><th className="p-3 font-medium">Alergênicos</th></tr></thead>
                  <tbody>
                    {data.items.map((i) => {
                      const kg = i.price_cents ? perKg(i, i.price_cents) : null;
                      return (
                        <tr key={i.id} className="border-t border-border align-top">
                          <td className="p-3">
                            <Link href={`/app/uan/insumos/${i.id}`} className="font-medium hover:underline">{i.name}</Link>
                            {!i.active && <Badge variant="outline" className="ml-2">Fora de uso</Badge>}
                            {i.food_name && <span className="block text-xs text-muted-foreground">{i.food_name}</span>}
                          </td>
                          <td className="p-3">{CATEGORY_LABEL[i.category]}</td>
                          <td className="p-3 text-right tabular-nums whitespace-nowrap">
                            {i.price_cents ? <>{brl(i.price_cents)}/{UNIT_LABEL[i.purchase_unit]}{kg !== null && i.purchase_unit !== 'kg' && <span className="block text-xs text-muted-foreground">{brl(kg)}/kg</span>}</> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3">{i.allergens.length ? <Badge variant="secondary">{i.allergens.length}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
