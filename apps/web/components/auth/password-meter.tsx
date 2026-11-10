import { Check, X } from 'lucide-react';
import { passwordRules, passwordStrength } from '@/lib/validation/signup';
import { cn } from '@/lib/utils';

const LABELS = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];
const COLORS = ['bg-muted', 'bg-destructive', 'bg-peach', 'bg-lemon', 'bg-primary'];

/** Indicador de força e checklist dos requisitos da senha. */
export function PasswordMeter({ value, id }: { value: string; id: string }) {
  const strength = passwordStrength(value);
  return (
    <div id={id} className="space-y-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= strength ? COLORS[strength] : 'bg-muted')} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Força da senha: <span className="font-medium text-foreground">{LABELS[strength]}</span>
      </p>
      <ul className="grid gap-1 text-xs sm:grid-cols-3">
        {passwordRules.map((r) => {
          const ok = r.test(value);
          return (
            <li key={r.id} className={cn('flex items-center gap-1.5', ok ? 'text-primary' : 'text-muted-foreground')}>
              {ok ? <Check className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
              <span>{r.label}</span>
              <span className="sr-only">{ok ? '(atendido)' : '(pendente)'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
