import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { NewCycle } from '@/components/uan/menu-editor';
import { TodayMenu } from '@/components/uan/today-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/auth/session';
import { getUnitMenus } from '@/lib/uan/menu-actions';
import { cycleDate, MENU_STATUS_LABEL, SERVICE_LABEL } from '@/lib/uan/menus';

export const metadata: Metadata = { title: 'Cardápios', robots: { index: false } };

export default async function UnitMenusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}/cardapios`);
  const data = await getUnitMenus(id);
  if (data === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar os cardápios agora.</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${id}`} className="text-sm text-muted-foreground hover:underline">← {data.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Cardápios</h1>
              <p className="text-sm text-muted-foreground"><Link href={`/app/uan/fichas?empresa=${data.unit.organization_id}`} className="underline">Fichas técnicas</Link></p>
            </div>
            <TodayMenu data={data} />
            {data.can_edit && <NewCycle unitId={id} />}
            {data.cycles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cardápio {data.can_edit ? 'criado ainda' : 'aprovado ainda'}.</p>
            ) : (
              <ul aria-label="Cardápios da unidade" className="divide-y divide-border rounded-2xl border border-border bg-card">
                {data.cycles.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span>
                      <Link href={`/app/uan/cardapios/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                      <span className="block text-xs text-muted-foreground">{c.length_days} dias desde {cycleDate(c.starts_on, 1).label} · {c.services.map((s) => SERVICE_LABEL[s]).join(', ')}</span>
                    </span>
                    <Badge variant={c.status === 'approved' ? 'default' : 'secondary'}>{MENU_STATUS_LABEL[c.status]}</Badge>
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
