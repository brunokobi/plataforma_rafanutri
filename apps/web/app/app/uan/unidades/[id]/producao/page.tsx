import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { ProductionView } from '@/components/uan/production-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { getCurrentUser } from '@/lib/auth/session';
import { getProduction } from '@/lib/uan/production-actions';

export const metadata: Metadata = { title: 'Produção do dia', robots: { index: false } };
const shift = (iso: string, d: number) => {
  const x = new Date(`${iso}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

export default async function ProductionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ data?: string }> }) {
  const { id } = await params;
  const { data: date } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}/producao`);
  const d = await getProduction(id, date);
  if (d === undefined) notFound();
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar a produção agora.</AlertDescription></Alert>
        ) : (
          <>
            <div className="space-y-2">
              <Link href={`/app/uan/unidades/${id}`} className="text-sm text-muted-foreground hover:underline">← {d.unit.name}</Link>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Produção do dia</h1>
              <nav aria-label="Dia" className="flex flex-wrap items-center gap-3 text-sm">
                <Link href={`/app/uan/unidades/${id}/producao?data=${shift(d.day, -1)}`} className="underline">← dia anterior</Link>
                <form action={`/app/uan/unidades/${id}/producao`} className="flex items-center gap-2">
                  <Input type="date" name="data" defaultValue={d.day} aria-label="Escolher o dia" className="w-40" />
                  <button type="submit" className="underline">Ir</button>
                </form>
                <Link href={`/app/uan/unidades/${id}/producao?data=${shift(d.day, 1)}`} className="underline">dia seguinte →</Link>
              </nav>
            </div>
            <ProductionView key={d.day} data={d} />
          </>
        )}
      </main>
    </div>
  );
}
