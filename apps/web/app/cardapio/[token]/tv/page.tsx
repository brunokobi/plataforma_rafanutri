import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/uan/auto-refresh';
import { DishCard } from '@/components/uan/public-menu';
import { SERVICE_LABEL } from '@/lib/uan/menus';
import { groupByService, longDate } from '@/lib/uan/public-menu';
import { getPublicMenu } from '@/lib/uan/public-menu-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cardápio — modo TV', robots: { index: false } };
const HEX = /^#[0-9a-f]{6}$/i;

/** RN-223 — Modo TV: cardápio do dia em letras grandes, atualizado sozinho a cada 5 minutos. */
export default async function PublicMenuTv({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const m = await getPublicMenu(token);
  if (!m) notFound();
  const color = m.unit.brand_color && HEX.test(m.unit.brand_color) ? m.unit.brand_color : '#2E7D32';
  const day = m.days[0]!;
  return (
    <main className="min-h-dvh bg-background px-10 py-8">
      <AutoRefresh seconds={300} />
      <header className="flex items-end justify-between gap-6 border-b-4 pb-4" style={{ borderColor: color }}>
        <h1 className="font-display text-6xl font-semibold" style={{ color }}>{m.unit.name}</h1>
        <p className="text-3xl first-letter:uppercase">{longDate(day.date)}</p>
      </header>
      {day.items.length === 0 ? <p className="mt-10 text-4xl text-muted-foreground">Cardápio do dia ainda não publicado.</p> : (
        <div className="mt-6 grid gap-10 xl:grid-cols-2">
          {groupByService(day.items).map((g) => (
            <section key={g.service}>
              <h2 className="text-3xl font-semibold uppercase tracking-wide" style={{ color }}>{SERVICE_LABEL[g.service]}</h2>
              <ul className="divide-y divide-border">{g.items.map((it) => <DishCard key={`${it.service}-${it.slot}`} dish={it} big />)}</ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
