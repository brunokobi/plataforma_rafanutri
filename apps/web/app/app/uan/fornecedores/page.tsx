import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { EditSupplier, NewSupplier } from '@/components/uan/catalog-forms';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/auth/session';
import { getSuppliers } from '@/lib/uan/catalog-actions';
import { formatCnpj } from '@/lib/uan/types';

export const metadata: Metadata = { title: 'Fornecedores', robots: { index: false } };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan');
  const data = await getSuppliers(empresa ?? '');
  if (data === undefined) notFound();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← UAN e Qualidade</Link>
        {data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar os fornecedores agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Fornecedores</h1>
              <p className="text-sm text-muted-foreground">{data.organization.name} · <Link href={`/app/uan/insumos?empresa=${data.organization.id}`} className="underline">Insumos</Link></p>
            </div>
            {data.can_manage && <NewSupplier orgId={data.organization.id} />}
            {data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado ainda.</p>
            ) : (
              <ul aria-label="Fornecedores" className="divide-y divide-border rounded-2xl border border-border bg-card">
                {data.items.map((s) => (
                  <li key={s.id} className="space-y-2 p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{s.name} {!s.active && <Badge variant="outline">Inativo</Badge>}</p>
                        <p className="text-xs text-muted-foreground">
                          {[s.cnpj && `CNPJ ${formatCnpj(s.cnpj)}`, s.contact_name, s.phone, s.email].filter(Boolean).join(' · ') || 'Sem contato'}
                          {` · ${s.ingredient_count ?? 0} insumo(s) com preço`}
                        </p>
                      </div>
                      {data.can_manage && <EditSupplier orgId={data.organization.id} supplier={s} />}
                    </div>
                    {s.notes && <p className="text-muted-foreground">{s.notes}</p>}
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
