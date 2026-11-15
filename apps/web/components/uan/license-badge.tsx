import { licenseStatus } from '@/lib/uan/types';
import { cn } from '@/lib/utils';

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/** Situação do alvará sanitário (RN-123): vencido, vencendo em 30 dias, em dia ou sem data. */
export function LicenseBadge({ expires, today, className }: { expires: string | null; today: string; className?: string }) {
  const { status, days } = licenseStatus(expires, today);
  const text =
    status === 'missing' ? 'Alvará sem validade cadastrada'
    : status === 'expired' ? `Alvará vencido em ${fmt(expires!)}`
    : status === 'expiring' ? (days === 0 ? 'Alvará vence hoje' : `Alvará vence em ${days} dia(s) (${fmt(expires!)})`)
    : `Alvará válido até ${fmt(expires!)}`;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'expired' && 'bg-destructive/10 text-destructive',
        status === 'expiring' && 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
        status === 'ok' && 'bg-primary/10 text-primary',
        status === 'missing' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {text}
    </span>
  );
}
