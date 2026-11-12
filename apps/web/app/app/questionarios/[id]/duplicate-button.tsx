'use client';

import { Copy, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { duplicateTemplate } from '@/lib/questionnaires/actions';

export function DuplicateButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="text-right">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await duplicateTemplate(id);
            if (r.ok && r.id) router.push(`/app/questionarios/${r.id}`);
            else setError(r.ok ? 'Não foi possível duplicar.' : r.message);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} Duplicar para editar
      </Button>
      {error && <p role="status" className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
