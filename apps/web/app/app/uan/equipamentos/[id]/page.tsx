import { AlertCircle, QrCode } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { EquipmentForm } from '@/components/uan/equipment-form';
import { RecordTemperature } from '@/components/uan/record-temperature';
import { TemperatureChart } from '@/components/uan/temperature-chart';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/auth/session';
import { getEquipment } from '@/lib/uan/temperature-actions';
import { EQUIPMENT_KIND_LABEL, formatTemp, limitsLabel } from '@/lib/uan/temperatures';

export const metadata: Metadata = { title: 'Equipamento', robots: { index: false } };

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export default async function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/equipamentos/${id}`);
  const detail = await getEquipment(id);
  if (detail === undefined) notFound();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {detail === null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>Não foi possível carregar o equipamento agora. Atualize a página em instantes.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${detail.unit.id}`} className="text-sm text-muted-foreground hover:underline">← {detail.unit.name}</Link>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{detail.equipment.name}</h1>
              <p className="text-sm text-muted-foreground">
                {EQUIPMENT_KIND_LABEL[detail.equipment.kind]} · limite {limitsLabel(detail.equipment)} · registrar a cada {detail.equipment.reading_interval_hours} h
                {!detail.equipment.active && ' · fora de uso'}
              </p>
              {detail.equipment.overdue && detail.equipment.active && <Badge variant="secondary" className="mt-2">Leitura atrasada</Badge>}
            </div>

            {detail.can_record && (
              <section aria-labelledby="registrar" className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <h2 id="registrar" className="font-semibold">Registrar temperatura</h2>
                <RecordTemperature
                  unitId={detail.unit.id}
                  equipment={{ id: detail.equipment.id, name: detail.equipment.name, min_temp: detail.equipment.min_temp, max_temp: detail.equipment.max_temp }}
                />
              </section>
            )}

            <section aria-labelledby="historico" className="space-y-3">
              <h2 id="historico" className="font-display text-xl font-semibold">Últimos {detail.days} dias</h2>
              {detail.readings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma leitura no período.</p>
              ) : (
                <>
                  <TemperatureChart readings={detail.readings} limits={detail.equipment} name={detail.equipment.name} />
                  <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                    <table className="w-full text-left text-sm tabular-nums">
                      <caption className="sr-only">Leituras de {detail.equipment.name}</caption>
                      <thead>
                        <tr className="text-muted-foreground"><th className="p-2 font-medium">Quando</th><th className="p-2 text-right font-medium">Temperatura</th><th className="p-2 font-medium">Ação corretiva</th><th className="p-2 font-medium">Quem</th></tr>
                      </thead>
                      <tbody>
                        {detail.readings.map((r) => (
                          <tr key={r.id} className="border-t border-border align-top">
                            <td className="p-2 whitespace-nowrap">{when(r.recorded_at)}</td>
                            <td className="p-2 text-right whitespace-nowrap">
                              {r.out_of_range ? <Badge variant="destructive">{formatTemp(r.value)}</Badge> : formatTemp(r.value)}
                            </td>
                            <td className="p-2">{r.corrective_action ?? '—'}</td>
                            <td className="p-2">{r.recorded_by_name ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <Link href={`/app/uan/equipamentos/${detail.equipment.id}/etiqueta`} className="inline-flex items-center gap-2 text-sm font-medium text-primary underline">
              <QrCode className="size-4" aria-hidden="true" /> Etiqueta com QR code para colar no equipamento
            </Link>

            {detail.can_manage && (
              <section aria-labelledby="ajustes" className="space-y-3">
                <h2 id="ajustes" className="font-display text-xl font-semibold">Ajustes</h2>
                <EquipmentForm unitId={detail.unit.id} equipment={detail.equipment} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
