import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { MODULES } from '@/lib/modules/catalog';
import { PLANS, planPrice, type ModuleGrant, type PlanCode } from '@/lib/modules/plans';
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

/**
 * Tabela de comparação dos planos (preço, limites e módulos). `codes` escolhe as colunas, `cycle` o preço exibido
 * e `footer` acrescenta uma linha de ações (ex.: botões de assinar em Meu plano).
 */
export function PlansComparison({ currentPlan, codes, cycle = 'monthly', footer }: {
  currentPlan: PlanCode;
  codes?: readonly PlanCode[];
  cycle?: 'monthly' | 'annual';
  footer?: (code: PlanCode) => ReactNode;
}) {
  const plans = codes ? PLANS.filter((p) => codes.includes(p.code)) : PLANS;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="sr-only">Comparação de preços, limites e módulos por plano</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="p-4 text-left font-semibold">Módulo</th>
            {plans.map((p) => (
              <th
                key={p.code}
                scope="col"
                className={cn('p-4 text-center align-top font-semibold', p.code === currentPlan && 'bg-primary/5')}
              >
                <span className="block">{p.name}</span>
                <span className="mt-1 block font-display text-base font-semibold">{planPrice(p, cycle).main}</span>
                {planPrice(p, cycle).note && <span className="block text-xs font-normal text-muted-foreground">{planPrice(p, cycle).note}</span>}
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
          <tr className="border-b border-border">
            <th scope="row" className="p-4 text-left font-medium">Pacientes ativos</th>
            {plans.map((p) => (
              <td key={p.code} className={cn('p-4 text-center font-semibold', p.code === currentPlan && 'bg-primary/5')}>
                {p.code === 'enterprise_uan' ? <span className="text-muted-foreground">—</span> : p.maxActivePatients === null ? 'Sem limite' : `Até ${p.maxActivePatients}`}
              </td>
            ))}
          </tr>
          <tr className="border-b border-border">
            <th scope="row" className="p-4 text-left font-medium">Profissionais na equipe</th>
            {plans.map((p) => (
              <td key={p.code} className={cn('p-4 text-center font-semibold', p.code === currentPlan && 'bg-primary/5')}>
                {p.maxMembers === null ? 'Sem limite' : p.maxMembers === 1 ? '1' : `Até ${p.maxMembers}`}
              </td>
            ))}
          </tr>
          {MODULES.map((m) => (
            <tr key={m.code} className="border-b border-border last:border-0">
              <th scope="row" className="p-4 text-left font-medium">{m.name}</th>
              {plans.map((p) => (
                <td key={p.code} className={cn('p-4 text-center', p.code === currentPlan && 'bg-primary/5')}>
                  <Cell {...p.grants[m.code]} />
                </td>
              ))}
            </tr>
          ))}
          {footer && (
            <tr>
              <th scope="row" className="p-4 text-left font-medium"><span className="sr-only">Ações</span></th>
              {plans.map((p) => (
                <td key={p.code} className={cn('p-4 text-center align-top', p.code === currentPlan && 'bg-primary/5')}>{footer(p.code)}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
