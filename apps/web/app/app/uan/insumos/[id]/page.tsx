import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { IngredientForm, PriceForm } from '@/components/uan/catalog-forms';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { today } from '@/lib/appointments/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { getIngredient } from '@/lib/uan/catalog-actions';
import { ALLERGEN_LABEL, brl, CATEGORY_LABEL, perKg, priceChange, STORAGE_LABEL, UNIT_LABEL } from '@/lib/uan/catalog';

export const metadata: Metadata = { title: 'Insumo', robots: { index: false } };
const day = (d: string) => d.split('-').reverse().join('/');
const SOURCE = { manual: 'Manual', receiving: 'Recebimento', import: 'Planilha' } as const;

export default async function IngredientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/insumos/${id}`);
  const d = await getIngredient(id);
  if (d === undefined) notFound();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o insumo agora.</AlertDescription></Alert>
        ) : (
          (() => {
            const i = d.ingredient;
            const unit = UNIT_LABEL[i.purchase_unit];
            const change = priceChange(d.prices, today());
            const kg = d.current_price ? perKg(i, d.current_price.price_cents) : null;
            return (
              <>
                <div className="space-y-1">
                  <Link href={`/app/uan/insumos?empresa=${i.organization_id}`} className="text-sm text-muted-foreground hover:underline">← Insumos</Link>
                  <h1 className="font-display text-3xl font-semibold tracking-tight">{i.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {CATEGORY_LABEL[i.category]} · compra por {unit} · {STORAGE_LABEL[i.storage]} · FC {i.default_fc.toLocaleString('pt-BR')}
                    {d.food && ` · ${d.food.name}`}
                  </p>
                  {i.allergens.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1" aria-label="Alergênicos">
                      {i.allergens.map((a) => <Badge key={a} variant="secondary">{ALLERGEN_LABEL[a]}</Badge>)}
                    </div>
                  )}
                </div>

                <section aria-labelledby="preco" className="space-y-3">
                  <h2 id="preco" className="font-display text-xl font-semibold">Preço</h2>
                  {d.current_price ? (
                    <p className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-3xl font-semibold tabular-nums" aria-label="Preço vigente">{brl(d.current_price.price_cents)}</span>
                      <span className="text-sm text-muted-foreground">por {unit}{kg !== null && i.purchase_unit !== 'kg' ? ` · ${brl(kg)}/kg` : ''} · desde {day(d.current_price.valid_from)}</span>
                      {change !== null && change !== 0 && (
                        <span className={change > 0 ? 'inline-flex items-center gap-1 text-sm text-destructive' : 'inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400'}>
                          {change > 0 ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
                          {change > 0 ? '+' : ''}{change.toLocaleString('pt-BR')}% em relação ao anterior
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem preço registrado.</p>
                  )}
                  {d.can_manage && <PriceForm ingredientId={i.id} unitLabel={unit} suppliers={d.suppliers} />}
                  {d.prices.length > 0 && (
                    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                      <table className="w-full text-left text-sm tabular-nums">
                        <caption className="sr-only">Histórico de preços de {i.name}</caption>
                        <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Vigência</th><th className="p-2 text-right font-medium">Preço/{unit}</th><th className="p-2 font-medium">Fornecedor</th><th className="p-2 font-medium">Origem</th></tr></thead>
                        <tbody>
                          {d.prices.map((p) => (
                            <tr key={p.id} className="border-t border-border">
                              <td className="p-2">{day(p.valid_from)}</td>
                              <td className="p-2 text-right">{brl(p.price_cents)}</td>
                              <td className="p-2">{p.supplier_name ?? '—'}</td>
                              <td className="p-2">{SOURCE[p.source]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {d.can_manage && (
                  <section aria-labelledby="cadastro" className="space-y-3">
                    <h2 id="cadastro" className="font-display text-xl font-semibold">Cadastro</h2>
                    <IngredientForm orgId={i.organization_id} ingredient={i} food={d.food} />
                  </section>
                )}
              </>
            );
          })()
        )}
      </main>
    </div>
  );
}
