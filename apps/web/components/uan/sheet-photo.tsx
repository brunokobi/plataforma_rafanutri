'use client';

import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { resizeImage } from '@/lib/recipes/resize-image';
import { setSheetPhoto } from '@/lib/uan/sheet-actions';

/** RN-129 — Foto da preparação na ficha técnica (montagem do prato para a equipe). */
export function SheetPhoto({ sheetId, name, hasPhoto, canEdit, version }: { sheetId: string; name: string; hasPhoto: boolean; canEdit: boolean; version: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!hasPhoto && !canEdit) return null;
  const upload = (image: string | null) =>
    startTransition(async () => {
      setError(null);
      const r = await setSheetPhoto(sheetId, image);
      if (!r.ok) return setError(r.message);
      router.refresh();
    });
  return (
    <section aria-label="Foto da preparação" className="flex flex-wrap items-end gap-4">
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto servida pela rota autenticada
        <img src={`/api/uan/fichas/${sheetId}/foto?v=${encodeURIComponent(version)}`} alt={`Foto de ${name}`} className="h-40 w-56 rounded-xl border border-border object-cover" />
      ) : (
        <div className="flex h-40 w-56 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">Sem foto da preparação</div>
      )}
      {canEdit && (
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {hasPhoto ? 'Trocar foto' : 'Adicionar foto'}
            <input type="file" accept="image/*" className="sr-only" aria-label="Foto da preparação"
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { upload(await resizeImage(f, 1200)); } catch (err) { setError(err instanceof Error ? err.message : 'Foto inválida.'); } }} />
          </label>
          {hasPhoto && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => upload(null)}><Trash2 className="size-4" /> Remover foto</Button>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
