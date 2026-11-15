'use client';

import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSheet } from '@/lib/uan/sheet-actions';
import { SHEET_CATEGORY_LABEL, type SheetCategory } from '@/lib/uan/techsheets';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function NewSheet({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', category: 'main' as SheetCategory, servings: '10' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) return <Button type="button" onClick={() => setOpen(true)}><Plus className="size-4" /> Nova ficha técnica</Button>;
  return (
    <form
      aria-label="Nova ficha técnica"
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_12rem_7rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await createSheet(orgId, { name: v.name, category: v.category, servings: Number(v.servings) });
          if (!r.ok) return setError(r.message);
          router.push(`/app/uan/fichas/${r.id}`);
        });
      }}
    >
      <div className="space-y-1.5"><Label htmlFor="ns-name">Nome da preparação</Label><Input id="ns-name" maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="space-y-1.5">
        <Label htmlFor="ns-cat">Categoria</Label>
        <select id="ns-cat" className={SELECT} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as SheetCategory })}>
          {(Object.keys(SHEET_CATEGORY_LABEL) as SheetCategory[]).map((c) => <option key={c} value={c}>{SHEET_CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="ns-serv">Porções</Label><Input id="ns-serv" inputMode="numeric" value={v.servings} onChange={(e) => setV({ ...v, servings: e.target.value })} /></div>
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Criar ficha</Button>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-4">{error}</p>}
    </form>
  );
}
