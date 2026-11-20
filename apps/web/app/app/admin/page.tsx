import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { adminOrgs } from '@/lib/admin/actions';
import { getCurrentUser } from '@/lib/auth/session';
import { CONTRACT_STATE_LABEL } from '@/lib/uan/contract';

export const metadata: Metadata = { title: 'Administração', robots: { index: false } };

/** Administração da plataforma: empresas, módulo UAN e situação do contrato. Só admin da plataforma. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/admin');
  const orgs = await adminOrgs(q ?? '');
  if (!orgs) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Administração</h1>
          <p className="text-sm text-muted-foreground">Empresas da plataforma, módulo UAN e contratos.</p>
        </div>
        <form className="flex gap-2" role="search">
          <Input name="q" defaultValue={q ?? ''} placeholder="Buscar empresa" aria-label="Buscar empresa" className="max-w-sm" />
        </form>
        <ul aria-label="Empresas" className="divide-y divide-border rounded-2xl border border-border bg-card">
          {orgs.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0">
                <Link href={`/app/admin/empresas/${o.id}`} className="font-medium hover:underline">{o.name}</Link>
                <span className="block text-xs text-muted-foreground">{o.owner_email ?? '—'} · {o.modules.join(', ')}{o.modules.includes('uan') ? ` · ${o.active_units} de ${o.unit_limit} unidade(s)` : ''}</span>
              </span>
              {o.contract_state && <Badge variant={o.contract_state === 'active' ? 'default' : o.contract_state === 'none' ? 'secondary' : 'destructive'}>{CONTRACT_STATE_LABEL[o.contract_state]}</Badge>}
            </li>
          ))}
          {orgs.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhuma empresa encontrada.</li>}
        </ul>
      </main>
    </div>
  );
}
