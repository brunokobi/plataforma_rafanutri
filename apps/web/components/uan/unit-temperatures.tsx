import { Thermometer } from 'lucide-react';
import Link from 'next/link';
import { NewEquipment } from '@/components/uan/equipment-form';
import { RecordTemperature } from '@/components/uan/record-temperature';
import { Badge } from '@/components/ui/badge';
import { EQUIPMENT_KIND_LABEL, equipmentStatus, FOOD_STAGE_LABEL, formatTemp, limitsLabel, type UnitTemperatures } from '@/lib/uan/temperatures';

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const STATUS = {
  ok: { label: 'Dentro do limite', variant: 'default' },
  out: { label: 'Fora do limite', variant: 'destructive' },
  overdue: { label: 'Leitura atrasada', variant: 'secondary' },
  never: { label: 'Sem leitura', variant: 'secondary' },
  inactive: { label: 'Fora de uso', variant: 'outline' },
} as const;

/** Seção "Temperaturas" da unidade: equipamentos com a última leitura e registro de alimento. */
export function UnitTemperaturesSection({ unitId, data }: { unitId: string; data: UnitTemperatures }) {
  return (
    <section aria-labelledby="temperaturas" className="space-y-5">
      <h2 id="temperaturas" className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
        <Thermometer className="size-6 text-primary" aria-hidden="true" /> Temperaturas
      </h2>

      {data.equipment.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado. Cadastre geladeiras, freezers e balcões para registrar as temperaturas.</p>
      ) : (
        <ul aria-label="Equipamentos" className="grid gap-3 sm:grid-cols-2">
          {data.equipment.map((e) => {
            const s = STATUS[equipmentStatus(e)];
            return (
              <li key={e.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/app/uan/equipamentos/${e.id}`} className="font-medium hover:underline">{e.name}</Link>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{EQUIPMENT_KIND_LABEL[e.kind]} · {limitsLabel(e)} · a cada {e.reading_interval_hours} h</p>
                <p className="text-sm">
                  {e.last ? <>Última: <span className="font-semibold">{formatTemp(e.last.value)}</span> <span className="text-muted-foreground">em {when(e.last.recorded_at)}</span></> : <span className="text-muted-foreground">Ainda sem leitura.</span>}
                </p>
                {data.can_record && e.active && (
                  <Link href={`/app/uan/equipamentos/${e.id}`} className="text-sm font-medium text-primary underline">Registrar temperatura</Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data.can_manage && <NewEquipment unitId={unitId} />}

      {data.can_record && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h3 className="font-semibold">Temperatura de alimento</h3>
          <RecordTemperature unitId={unitId} idPrefix="food" />
        </div>
      )}
      {data.food_readings.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Últimas temperaturas de alimentos</h3>
          <ul aria-label="Temperaturas de alimentos" className="divide-y divide-border rounded-2xl border border-border bg-card">
            {data.food_readings.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.food_name}</span>
                  <span className="block text-xs text-muted-foreground">{r.food_stage ? FOOD_STAGE_LABEL[r.food_stage] : ''} · {when(r.recorded_at)}</span>
                  {r.corrective_action && <span className="mt-1 block text-xs">Ação: {r.corrective_action}</span>}
                </span>
                <Badge variant={r.out_of_range ? 'destructive' : 'default'}>{formatTemp(r.value)}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
