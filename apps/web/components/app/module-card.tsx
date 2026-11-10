import { ArrowRight, Baby, Briefcase, Check, ChefHat, Clock, Landmark, Lock, Smartphone, Sparkles, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { IconName } from '@/lib/modules/catalog';
import type { ModuleAccessView } from '@/lib/modules/access';
import { cn } from '@/lib/utils';

const ICONS: Record<IconName, typeof Stethoscope> = {
  stethoscope: Stethoscope,
  smartphone: Smartphone,
  briefcase: Briefcase,
  sparkles: Sparkles,
  baby: Baby,
  'chef-hat': ChefHat,
  landmark: Landmark,
};

function StatusBadge({ view }: { view: ModuleAccessView }) {
  switch (view.status) {
    case 'available':
      return <Badge className="gap-1"><Check className="size-3" /> Disponível</Badge>;
    case 'included_soon':
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="size-3" /> Incluso no seu plano · em breve
        </Badge>
      );
    case 'contract':
      return <Badge variant="outline">Sob contrato</Badge>;
    case 'upgrade':
      return (
        <Badge variant="outline" className="gap-1">
          <Lock className="size-3" aria-hidden="true" /> Disponível no plano {view.unlockedBy[0]?.name ?? 'pago'}
        </Badge>
      );
  }
}

export function ModuleCard({ view }: { view: ModuleAccessView }) {
  const { module } = view;
  const Icon = ICONS[module.icon];
  const locked = view.status === 'upgrade' || view.status === 'contract';

  return (
    <article
      data-testid={`module-${module.code}`}
      data-status={view.status}
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-card p-5 transition-shadow',
        locked ? 'border-dashed border-border bg-card/60' : 'border-border hover:shadow-lg hover:shadow-primary/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl',
            locked ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{module.phase}</span>
      </div>

      <h3 className="mt-4 text-lg font-semibold">{module.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{module.summary}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusBadge view={view} />
        {view.grant === 'quota' && <Badge variant="secondary">Cota diária{view.note ? `: ${view.note}` : ''}</Badge>}
      </div>

      <ul className="mt-4 flex-1 space-y-1.5 text-sm">
        {module.includes.map((item) => (
          <li key={item} className="flex gap-2">
            <Check className={cn('mt-0.5 size-4 shrink-0', locked ? 'text-muted-foreground' : 'text-primary')} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {view.status === 'available' && module.href ? (
          <Button asChild className="w-full">
            <Link href={module.href}>
              Abrir <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : view.status === 'included_soon' ? (
          <div className="space-y-2">
            {module.demoHref && (
              <Button asChild variant="outline" className="w-full">
                <Link href={module.demoHref}>
                  Ver demonstração <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
            <p className="text-sm font-medium text-primary">Chega na {module.phase}</p>
          </div>
        ) : view.status === 'contract' ? (
          <Button asChild variant="outline" className="w-full">
            <a href="#planos">Falar com a equipe</a>
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <a href="#planos">Ver planos</a>
          </Button>
        )}
      </div>
    </article>
  );
}
