'use client';

import { Library, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { addStarterIngredients } from '@/lib/uan/catalog-actions';

/** Botão do catálogo básico de insumos: cadastra só o que falta (pode usar mais de uma vez). */
export function StarterCatalog({ orgId, size, highlight }: { orgId: string; size: number; highlight: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await addStarterIngredients(orgId);
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      setMsg({ ok: true, text: r.added ? `${r.added} insumos adicionados. Confira o fator de correção e cadastre os preços.` : 'Todos os insumos do catálogo básico já estão cadastrados.' });
      router.push(`/app/uan/insumos?empresa=${orgId}`);
      router.refresh();
    });
  }

  const button = (
    <Button type="button" variant={highlight ? 'default' : 'outline'} disabled={pending} onClick={run}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Library className="size-4" />} Adicionar catálogo básico
    </Button>
  );
  const status = msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</p>;

  if (!highlight) return <div className="flex flex-wrap items-center gap-3">{button}{status}</div>;
  return (
    <section aria-labelledby="starter" className="space-y-3 rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-5">
      <h2 id="starter" className="font-display text-lg font-semibold">Comece pelo catálogo básico</h2>
      <p className="text-sm text-muted-foreground">
        {size} insumos comuns em UAN (hortifrúti, carnes, laticínios, grãos, mercearia, limpeza e descartáveis), com unidade de compra, armazenamento,
        alergênicos e fator de correção de referência. Depois é só ajustar o fator à sua medição e cadastrar os preços.
      </p>
      {button}
      {status}
    </section>
  );
}
