import { Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanDefinition } from '@/lib/modules/plans';

export function PlanSummary({ plan }: { plan: PlanDefinition }) {
  const patients = plan.maxActivePatients ? `Até ${plan.maxActivePatients} pacientes ativos` : 'Pacientes ativos ampliados';
  const members = plan.maxMembers === 1 ? '1 nutricionista' : plan.maxMembers ? `Até ${plan.maxMembers} membros` : 'Equipe sem limite fixo';
  return (
    <section
      aria-labelledby="plano-atual"
      className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Crown className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Seu plano</p>
          <h2 id="plano-atual" className="text-xl font-semibold">{plan.name}</h2>
          <p className="text-sm text-muted-foreground">
            {patients} · {members}
          </p>
        </div>
      </div>
      <Button asChild variant="outline">
        <a href="#planos">Comparar planos</a>
      </Button>
    </section>
  );
}
