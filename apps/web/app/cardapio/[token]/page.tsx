import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DishCard, RateDish } from '@/components/uan/public-menu';
import { cn } from '@/lib/utils';
import { SERVICE_LABEL } from '@/lib/uan/menus';
import { groupByService, longDate } from '@/lib/uan/public-menu';
import { getPublicMenu } from '@/lib/uan/public-menu-actions';

export const dynamic = 'force-dynamic';
const HEX = /^#[0-9a-f]{6}$/i;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const m = await getPublicMenu((await params).token);
  return { title: m ? `Cardápio — ${m.unit.name}` : 'Cardápio', robots: { index: false } };
}

/** RN-223 — Cardápio publicado para o comensal (dia ou semana), com alergênicos, nutrientes e avaliação. */
export default async function PublicMenuPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ dia?: string; semana?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const week = sp.semana === '1';
  const m = await getPublicMenu(token, sp.dia, week);
  if (!m) notFound();
  const color = m.unit.brand_color && HEX.test(m.unit.brand_color) ? m.unit.brand_color : '#2E7D32';
  const base = `/cardapio/${token}`;
  const canRate = (d: string) => m.survey && d <= m.today && Date.parse(`${m.today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`) <= 2 * 86400e3;

  return (
    <div className="min-h-dvh bg-background">
      <div className="h-2" style={{ background: color }} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <header>
          <p className="text-sm text-muted-foreground">{m.unit.organization}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight" style={{ color }}>{m.unit.name}</h1>
        </header>
        <nav aria-label="Período" className="flex gap-2">
          <Link href={base} aria-current={!week ? 'page' : undefined} className={cn('rounded-full border px-4 py-1.5 text-sm', !week ? 'border-transparent text-white' : 'border-border')} style={!week ? { background: color } : undefined}>Hoje</Link>
          <Link href={`${base}?semana=1`} aria-current={week ? 'page' : undefined} className={cn('rounded-full border px-4 py-1.5 text-sm', week ? 'border-transparent text-white' : 'border-border')} style={week ? { background: color } : undefined}>Semana</Link>
        </nav>
        {m.days.map((d) => (
          <section key={d.date} aria-label={longDate(d.date)} className="space-y-3">
            <h2 className="font-display text-xl font-semibold first-letter:uppercase">{longDate(d.date)}{d.date === m.today ? ' · hoje' : ''}</h2>
            {d.items.length === 0 ? <p className="text-sm text-muted-foreground">Cardápio não publicado para este dia.</p> : groupByService(d.items).map((g) => (
              <div key={g.service} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color }}>{SERVICE_LABEL[g.service]}</h3>
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <DishCard key={`${it.service}-${it.slot}`} dish={it}>
                      {!week && canRate(d.date) && m.survey!.per_dish && <RateDish token={token} survey={m.survey!} dish={it} servedOn={d.date} />}
                    </DishCard>
                  ))}
                </ul>
              </div>
            ))}
            {!week && canRate(d.date) && !m.survey!.per_dish && d.items.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-border p-4">
                <p className="font-medium">{m.survey!.title}</p>
                <RateDish token={token} survey={m.survey!} dish={null} servedOn={d.date} />
              </div>
            )}
          </section>
        ))}
        <p className="text-xs text-muted-foreground">Os alergênicos e nutrientes vêm das fichas técnicas da cozinha. Em caso de alergia, confirme com a equipe antes de consumir.</p>
      </main>
    </div>
  );
}
