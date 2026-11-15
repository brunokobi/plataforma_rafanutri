'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { UnitForm } from '@/components/uan/unit-form';
import { Button } from '@/components/ui/button';

/** Botão "Nova unidade" que abre o formulário (só o owner, com vaga no contrato). */
export function NewUnit({ organizationId, disabled, reason }: { organizationId: string; disabled?: boolean; reason?: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <UnitForm organizationId={organizationId} onCancel={() => setOpen(false)} />;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="size-4" /> Nova unidade
      </Button>
      {disabled && reason && <p className="text-sm text-muted-foreground">{reason}</p>}
    </div>
  );
}
