'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createUnit, updateUnit } from '@/lib/uan/actions';
import { formatCnpj, UNIT_KIND_LABEL, validateUnit, type ProductionUnit, type UnitInput, type UnitKind } from '@/lib/uan/types';
import { cn } from '@/lib/utils';

const KINDS = Object.keys(UNIT_KIND_LABEL) as UnitKind[];
const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function initial(unit?: ProductionUnit): UnitInput {
  return {
    name: unit?.name ?? '',
    kind: unit?.kind ?? 'restaurant',
    cnpj: unit?.cnpj ? formatCnpj(unit.cnpj) : '',
    address: unit?.address ?? '',
    city: unit?.city ?? '',
    state: unit?.state ?? '',
    geo_lat: unit?.geo_lat == null ? '' : String(unit.geo_lat),
    geo_lng: unit?.geo_lng == null ? '' : String(unit.geo_lng),
    geo_radius_m: String(unit?.geo_radius_m ?? 200),
    sanitary_license: unit?.sanitary_license ?? '',
    sanitary_license_expires_at: unit?.sanitary_license_expires_at ?? '',
    active: unit?.active,
  };
}

/** RN-123 — Cadastro e edição da unidade produtora. Sem `unit` = nova unidade da empresa `organizationId`. */
export function UnitForm({
  organizationId,
  unit,
  canToggleActive = false,
  onCancel,
}: {
  organizationId?: string;
  unit?: ProductionUnit;
  /** Só o owner ativa/desativa (mexe no limite do contrato). */
  canToggleActive?: boolean;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<UnitInput>(() => initial(unit));
  const [errors, setErrors] = useState<Partial<Record<keyof UnitInput, string>>>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof UnitInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const field = (k: keyof UnitInput, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`unit-${k}`}>{label}</Label>
      <Input id={`unit-${k}`} value={String(v[k] ?? '')} onChange={set(k)} aria-invalid={Boolean(errors[k])} aria-describedby={errors[k] ? `unit-${k}-error` : undefined} {...props} />
      {errors[k] && <p id={`unit-${k}-error`} className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateUnit(v);
    setErrors(found);
    if (Object.keys(found).length) return setStatus({ kind: 'error', text: 'Revise os campos destacados.' });
    startTransition(async () => {
      const r = unit ? await updateUnit(unit.id, canToggleActive ? v : { ...v, active: undefined }) : await createUnit(organizationId!, v);
      if (!r.ok) {
        setErrors((r.fields ?? {}) as typeof errors);
        return setStatus({ kind: 'error', text: r.message });
      }
      setStatus({ kind: 'ok', text: unit ? 'Unidade salva.' : 'Unidade criada.' });
      if (unit) router.refresh();
      else router.push(`/app/uan/unidades/${r.unit.id}`);
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label={unit ? 'Dados da unidade' : 'Nova unidade'} className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('name', 'Nome da unidade', { maxLength: 120, required: true })}
        <div className="space-y-1.5">
          <Label htmlFor="unit-kind">Tipo</Label>
          <select id="unit-kind" value={v.kind} onChange={set('kind')} className={SELECT}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{UNIT_KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
        {field('cnpj', 'CNPJ (opcional)', { inputMode: 'numeric', placeholder: '00.000.000/0000-00' })}
        {field('address', 'Endereço (opcional)', { maxLength: 300 })}
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          {field('city', 'Cidade', { maxLength: 120 })}
          {field('state', 'UF', { maxLength: 2, className: 'uppercase' })}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Alvará sanitário</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('sanitary_license', 'Número (opcional)', { maxLength: 80 })}
          {field('sanitary_license_expires_at', 'Validade', { type: 'date' })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Localização (para conferir onde os checklists são feitos)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {field('geo_lat', 'Latitude', { inputMode: 'decimal', placeholder: '-20.3155' })}
          {field('geo_lng', 'Longitude', { inputMode: 'decimal', placeholder: '-40.3128' })}
          {field('geo_radius_m', 'Raio (m)', { inputMode: 'numeric' })}
        </div>
        <p className="text-xs text-muted-foreground">Dica: no Google Maps, clique com o botão direito no local e copie as coordenadas.</p>
      </fieldset>

      {unit && canToggleActive && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.active ?? true} onChange={(e) => setV((p) => ({ ...p, active: e.target.checked }))} className="size-4 accent-primary" />
          Unidade ativa (conta no limite do contrato)
        </label>
      )}

      {status && (
        <p role="status" className={cn('text-sm', status.kind === 'ok' ? 'text-primary' : 'text-destructive')}>{status.text}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />} {unit ? 'Salvar unidade' : 'Criar unidade'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        )}
      </div>
    </form>
  );
}
