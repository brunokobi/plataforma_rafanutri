import { CalendarPlus, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { dueLabel, daysUntil, returnReminderLink, type Returns } from '@/lib/crm/types';
import { cn } from '@/lib/utils';
import { isoToBR as br } from '@/lib/format/date';

const WINDOWS = [['', 'Vencidos e próximos 30 dias'], ['overdue', 'Vencidos'], ['7', 'Próximos 7 dias'], ['30', 'Próximos 30 dias']] as const;

/** RN-056 — Retornos: pacientes sem consulta marcada, pela data prevista (última consulta + intervalo de retorno). */
export function CrmReturns({ data, window, practice }: { data: Returns; window: string; practice: string }) {
  return (
    <div className="space-y-4">
      <nav aria-label="Filtrar retornos" className="flex flex-wrap gap-1">
        {WINDOWS.map(([k, label]) => (
          <Link key={k} href={`/app/crm?aba=retornos${k ? `&janela=${k}` : ''}`} aria-current={window === k ? 'page' : undefined}
            className={cn('rounded-md px-3 py-1.5 text-sm', window === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{label}</Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">Retorno previsto = última consulta concluída + intervalo do paciente (30 dias se não mudou). Quem já tem consulta marcada não aparece.</p>
      {data.returns.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum retorno nesse filtro.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Retornos">
          {data.returns.map((r) => {
            const late = daysUntil(r.due_date, data.today) < 0;
            const first = r.full_name.split(/\s+/)[0] ?? r.full_name;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/app/pacientes/${r.id}`} className="font-medium hover:underline">{r.full_name}</Link>
                  <p className="text-sm text-muted-foreground">Última consulta {br(r.last_visit)} · retorno a cada {r.return_interval_days} dias · previsto {br(r.due_date)}</p>
                </div>
                <p className={cn('text-sm font-medium', late ? 'text-destructive' : 'text-muted-foreground')}>{dueLabel(r.due_date, data.today)}</p>
                <div className="flex gap-1">
                  {r.phone && (
                    <a href={returnReminderLink(r.phone, first, practice)} target="_blank" rel="noopener noreferrer" aria-label={`Enviar lembrete a ${r.full_name} pelo WhatsApp`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"><MessageCircle className="size-4" /> Lembrete</a>
                  )}
                  <Link href={`/app/agenda?paciente=${r.id}`} aria-label={`Marcar retorno de ${r.full_name}`} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-primary hover:bg-muted">
                    <CalendarPlus className="size-4" /> Marcar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
