import { UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { SERVICE_LABEL, SERVICES, SLOT_LABEL, type UnitMenus } from '@/lib/uan/menus';

/** Cardápio de hoje (ciclos aprovados) — o que os cozinheiros veem na unidade. */
export function TodayMenu({ data }: { data: UnitMenus }) {
  const day = data.today.split('-').reverse().join('/');
  return (
    <section aria-labelledby="hoje-cardapio" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 id="hoje-cardapio" className="flex items-center gap-2 font-semibold"><UtensilsCrossed className="size-5 text-primary" aria-hidden="true" /> Cardápio de hoje ({day})</h2>
      {data.today_menus.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cardápio aprovado para hoje.</p>
      ) : (
        data.today_menus.map((m) => (
          <div key={m.cycle_id} className="space-y-2">
            <p className="text-xs text-muted-foreground">{m.cycle_name} · dia {m.day_index}</p>
            {SERVICES.filter((s) => m.items.some((i) => i.service === s)).map((s) => (
              <div key={s}>
                <h3 className="text-sm font-medium">{SERVICE_LABEL[s]}</h3>
                <ul aria-label={`${SERVICE_LABEL[s]} de hoje`} className="text-sm">
                  {m.items.filter((i) => i.service === s).map((i) => (
                    <li key={i.slot}>
                      <span className="text-muted-foreground">{SLOT_LABEL[i.slot]}:</span>{' '}
                      {i.sheet_id ? <Link href={`/app/uan/fichas/${i.sheet_id}`} className="hover:underline">{i.name}</Link> : i.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}
