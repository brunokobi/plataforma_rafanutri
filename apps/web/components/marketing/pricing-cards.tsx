'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPlan, planPrice, type PlanCode } from '@/lib/modules/plans';
import { Reveal } from './reveal';

export type PricingCard = { code: PlanCode; note: string; highlight?: boolean; features: string[] };

/** Cartões de preço da página inicial, com o seletor Mensal / Anual (12 meses com 50% de desconto). */
export function PricingCards({ plans }: { plans: PricingCard[] }) {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  return (
    <>
      <div role="radiogroup" aria-label="Forma de pagamento" className="mx-auto mt-8 flex w-fit rounded-full border border-border bg-card p-1 text-sm">
        {(['monthly', 'annual'] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)}
            className={`min-h-10 rounded-full px-5 font-medium transition-colors ${cycle === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {c === 'monthly' ? 'Mensal' : 'Anual · 50% off'}
          </button>
        ))}
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p, i) => {
          const plan = getPlan(p.code);
          const price = planPrice(plan, cycle);
          return (
            <Reveal key={p.code} delay={i * 0.08}>
              <article className={`relative flex h-full flex-col rounded-2xl border p-7 ${p.highlight ? 'border-primary bg-card shadow-xl shadow-primary/10' : 'border-border bg-card/60'}`}>
                {p.highlight && <Badge className="absolute -top-3 left-7">Comece por aqui</Badge>}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-3 font-display text-3xl font-semibold">{price.main}</p>
                <p className="text-sm text-muted-foreground">{price.note ?? p.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><span className="text-primary">✓</span>{f}</li>
                  ))}
                </ul>
                <Button asChild variant={p.highlight ? 'default' : 'outline'} className="mt-7 h-11">
                  <Link href="/cadastro">{p.code === 'free' ? 'Começar grátis' : 'Começar e assinar por Pix'}</Link>
                </Button>
              </article>
            </Reveal>
          );
        })}
      </div>
    </>
  );
}
