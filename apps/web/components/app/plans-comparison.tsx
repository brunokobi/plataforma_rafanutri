import { Check, Minus } from 'lucide-react';
import { MODULES } from '@/lib/modules/catalog';
import { PLANS, type ModuleGrant, type PlanCode } from '@/lib/modules/plans';
import { cn } from '@/lib/utils';

function Cell({ grant, note }: { grant: ModuleGrant; note?: string }) {
  if (grant === 'none') {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className="size-4" aria-hidden="true" />
        <span className="sr-only">Não incluso</span>
      </span>
    );
  }
  const label = grant === 'quota' ? 'Cota' : grant === 'contract' ? 'Contrato' : 'Incluso';
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className={cn('inline-flex items-center gap-1 font-medium', grant === 'contract' ? 'text-muted-foreground' : 'text-primary')}>
        {grant === 'included' && <Check className="size-4" aria-hidden="true" />}
        {label}
      </span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </span>
  );
}

export function PlansComparison({ currentPlan }: { currentPlan: PlanCode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="sr-only">Comparação de módulos por plano</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="p-4 text-left font-semibold">Módulo</th>
            {PLANS.map((p) => (
              <th
                key={p.code}
                scope="col"
                className={cn('p-4 text-center align-top font-semibold', p.code === currentPlan && 'bg-primary/5')}
              >
                <span className="block">{p.name}</span>
                <span className="block text-xs font-normal text-muted-foreground">{p.price}</span>
                {p.code === currentPlan && (
                  <span className="mt-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Seu plano
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((m) => (
            <tr key={m.code} className="border-b border-border last:border-0">
              <th scope="row" className="p-4 text-left font-medium">{m.name}</th>
              {PLANS.map((p) => (
                <td key={p.code} className={cn('p-4 text-center', p.code === currentPlan && 'bg-primary/5')}>
                  <Cell {...p.grants[m.code]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
