'use client';

import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createEquipment, updateEquipment } from '@/lib/uan/temperature-actions';
import { EQUIPMENT_DEFAULT_LIMITS, EQUIPMENT_KIND_LABEL, parseTemp, type Equipment, type EquipmentKind } from '@/lib/uan/temperatures';
import { toInputDecimal as txt } from '@/lib/format/number';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const KINDS = Object.keys(EQUIPMENT_KIND_LABEL) as EquipmentKind[];

/** Cadastro ou edição de equipamento; ao trocar o tipo, sugere os limites padrão. */
export function EquipmentForm({ unitId, equipment, onDone }: { unitId: string; equipment?: Equipment; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    name: equipment?.name ?? '',
    kind: (equipment?.kind ?? 'refrigerator') as EquipmentKind,
    min: txt(equipment ? equipment.min_temp : EQUIPMENT_DEFAULT_LIMITS.refrigerator.min_temp),
    max: txt(equipment ? equipment.max_temp : EQUIPMENT_DEFAULT_LIMITS.refrigerator.max_temp),
    interval: String(equipment?.reading_interval_hours ?? 8),
    active: equipment?.active ?? true,
  });
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = equipment ? 'Dados do equipamento' : 'Novo equipamento';

  const submit = () => {
    setError(null);
    setSaved(null);
    const min = v.min.trim() ? parseTemp(v.min) : null;
    const max = v.max.trim() ? parseTemp(v.max) : null;
    if ((v.min.trim() && min === null) || (v.max.trim() && max === null)) return setError({ message: 'Temperaturas como 5, -18 ou 4,5.' });
    if (min === null && max === null) return setError({ message: 'Informe ao menos um limite.' });
    const input = { name: v.name, kind: v.kind, min_temp: min, max_temp: max, reading_interval_hours: Number(v.interval), ...(equipment ? { active: v.active } : {}) };
    startTransition(async () => {
      const r = equipment ? await updateEquipment(equipment.id, input) : await createEquipment(unitId, input);
      if (!r.ok) return setError(r);
      setSaved(equipment ? 'Equipamento salvo.' : null);
      router.refresh();
      onDone?.();
    });
  };

  return (
    <form
      aria-label={label}
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="eq-name">Nome do equipamento</Label>
        <Input id="eq-name" maxLength={80} placeholder="Ex.: Geladeira de laticínios" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-invalid={Boolean(error?.fields?.name)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eq-kind">Tipo</Label>
        <select
          id="eq-kind" className={SELECT} value={v.kind}
          onChange={(e) => {
            const kind = e.target.value as EquipmentKind;
            const d = EQUIPMENT_DEFAULT_LIMITS[kind];
            setV({ ...v, kind, min: txt(d.min_temp), max: txt(d.max_temp) });
          }}
        >
          {KINDS.map((k) => <option key={k} value={k}>{EQUIPMENT_KIND_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eq-interval">Registrar a cada (horas)</Label>
        <Input id="eq-interval" inputMode="numeric" value={v.interval} onChange={(e) => setV({ ...v, interval: e.target.value })} aria-invalid={Boolean(error?.fields?.reading_interval_hours)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eq-min">Mínimo (°C)</Label>
        <Input id="eq-min" inputMode="text" placeholder="sem mínimo" value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eq-max">Máximo (°C)</Label>
        <Input id="eq-max" inputMode="text" placeholder="sem máximo" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} aria-invalid={Boolean(error?.fields?.max_temp)} />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Limites sugeridos pela RDC 216/2004 para o tipo escolhido; a RT ajusta se o fabricante ou o POP da unidade pedir outro valor.</p>
      {equipment && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="size-4" /> Equipamento em uso
        </label>
      )}
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error.fields ? Object.values(error.fields)[0] ?? error.message : error.message}</p>}
      {saved && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{saved}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} {equipment ? 'Salvar equipamento' : 'Cadastrar equipamento'}</Button>
        {onDone && !equipment && <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>}
      </div>
    </form>
  );
}

/** Botão que abre o cadastro de equipamento. */
export function NewEquipment({ unitId }: { unitId: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <EquipmentForm unitId={unitId} onDone={() => setOpen(false)} />;
  return <Button type="button" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" /> Novo equipamento</Button>;
}
