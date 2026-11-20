'use client';

import { Loader2, ScrollText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { acceptTerms } from '@/lib/legal/actions';
import { LEGAL_PATH, LEGAL_TITLE, type LegalDocument } from '@/lib/legal/info';
import { signOut } from '@/lib/auth/actions';

/** Aviso bloqueante: aceitar os documentos vigentes para continuar (ou sair). */
export function TermsDialog({ documents, changed }: { documents: LegalDocument[]; changed: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const patient = documents.includes('patient_terms');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="terms-title" className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <ScrollText className="size-8 text-primary" aria-hidden="true" />
        <h2 id="terms-title" className="font-display text-2xl font-semibold">{changed ? 'Atualizamos nossos documentos' : 'Antes de continuar'}</h2>
        <p className="text-sm text-muted-foreground">Leia e aceite para seguir usando a Rafanutri:</p>
        <ul className="space-y-1 text-sm">
          {documents.map((d) => <li key={d}><a href={LEGAL_PATH[d]} target="_blank" rel="noreferrer" className="font-medium text-primary underline">{LEGAL_TITLE[d]}</a></li>)}
        </ul>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Li e aceito {documents.length > 1 ? 'os documentos acima' : 'o documento acima'}{patient ? ' e consinto com o tratamento dos meus dados de saúde para o meu acompanhamento nutricional' : ''}.</span>
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!checked || pending}
            onClick={() => startTransition(async () => { setError(null); const r = await acceptTerms(documents); if (!r.ok) return setError(r.message); router.refresh(); })}>
            {pending && <Loader2 className="size-4 animate-spin" />} Aceitar e continuar
          </Button>
          <form action={signOut}><Button type="submit" variant="ghost">Sair</Button></form>
        </div>
      </div>
    </div>
  );
}
