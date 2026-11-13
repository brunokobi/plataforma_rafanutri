import { TriangleAlert } from 'lucide-react';
import type { HealthAlerts } from '@/lib/anamneses/alerts';

/** Destaque de alergias e restrições (vindas da anamnese) na ficha e no editor de plano. */
export function PatientAlerts({ alerts, patientId }: { alerts: HealthAlerts | null; patientId: string }) {
  if (!alerts) return null;
  const when = alerts.source.answeredAt
    ? new Date(alerts.source.answeredAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : null;
  return (
    <section role="note" aria-label="Alergias e restrições" className="rounded-2xl border-2 border-tomato/60 bg-tomato/10 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlert className="size-4 text-tomato" aria-hidden="true" /> Alergias e restrições
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {alerts.items.map((i) => (
          <li key={i.label}>
            <span className="font-medium">{i.text}</span>
            <span className="text-muted-foreground"> — {i.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Fonte: <a href={`/app/pacientes/${patientId}/anamneses`} className="underline">{alerts.source.title}</a>
        {when ? `, respondida em ${when}` : ''}
        {alerts.source.reviewed ? ' (revisada)' : ' (ainda não revisada)'}
      </p>
    </section>
  );
}
