'use client';

import { Loader2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { startChecklist } from '@/lib/uan/checklist-actions';

/** Localização atual (até 8 s); null se a pessoa negar ou o aparelho não tiver GPS. */
function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

/** Inicia o checklist (com a localização, se a unidade tiver coordenadas) e abre a execução. */
export function StartChecklist({ unitId, templateId, name, useGeo }: { unitId: string; templateId: string; name: string; useGeo: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-1">
      <Button
        type="button" size="sm" disabled={pending} aria-label={`Iniciar ${name}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const geo = useGeo ? await currentPosition() : null;
            const r = await startChecklist(unitId, templateId, crypto.randomUUID(), geo);
            if (r.ok) router.push(`/app/uan/checklists/${r.id}`);
            else setError(r.message);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Iniciar
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
