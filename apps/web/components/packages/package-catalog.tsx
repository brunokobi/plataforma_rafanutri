'use client';

import { Loader2, Pencil, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { centsToInput, formatCents, parseMoneyToCents } from '@/lib/finance/money';
import { savePackage } from '@/lib/packages/actions';
import type { PackageResult, ServicePackage } from '@/lib/packages/types';

/** RN-054 — Catálogo de pacotes do consultório. */
export function PackageCatalog({ list, canEdit }: { list: ServicePackage[]; canEdit: boolean }) {
  const [mode, setMode] = useState<'none' | 'new' | { edit: ServicePackage }>('none');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  function run(fn: () => Promise<PackageResult>, ok: string) {
    setFeedback(null);
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, text: ok } : { ok: false, text: r.message });
      if (r.ok) setMode('none');
    });
  }
  return (
    <section aria-labelledby="pacotes" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="pacotes" className="font-display text-3xl font-semibold tracking-tight">Pacotes de consultas</h1>
        {canEdit && mode === 'none' && <Button type="button" className="ml-auto" onClick={() => { setMode('new'); setFeedback(null); }}><Plus className="size-4" /> Novo pacote</Button>}
      </div>
      <p className="text-sm text-muted-foreground">Venda na ficha do paciente. Cada consulta concluída usa uma sessão do pacote ativo; desfazer a conclusão devolve a sessão.</p>
      {!canEdit && <p className="text-sm text-muted-foreground">Só owner ou nutricionista cria e altera pacotes.</p>}
      {feedback && <p role="status" className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}
      {mode === 'new' && <PackageForm pending={pending} onCancel={() => setMode('none')} onSubmit={(v) => run(() => savePackage(null, v), 'Pacote criado.')} />}
      {typeof mode === 'object' && <PackageForm initial={mode.edit} pending={pending} onCancel={() => setMode('none')} onSubmit={(v) => run(() => savePackage(mode.edit.id, v), 'Pacote atualizado.')} />}
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum pacote ainda. Exemplo: &ldquo;Acompanhamento trimestral&rdquo;, 3 sessões, 90 dias.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Pacotes">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}{!p.active && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">Inativo</span>}</p>
                <p className="text-sm text-muted-foreground">{p.sessions} {p.sessions === 1 ? 'sessão' : 'sessões'} · {formatCents(p.price_cents)}{p.validity_days ? ` · válido por ${p.validity_days} dias` : ''}</p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={pending}
                    onClick={() => run(() => savePackage(p.id, { name: p.name, sessions: p.sessions, price_cents: p.price_cents, validity_days: p.validity_days, active: !p.active }), p.active ? 'Pacote desativado: não aparece mais para venda.' : 'Pacote ativado.')}>
                    {p.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending || mode !== 'none'} aria-label={`Editar ${p.name}`} onClick={() => setMode({ edit: p })}><Pencil className="size-4" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PackageForm({ initial, pending, onSubmit, onCancel }: { initial?: ServicePackage; pending: boolean; onSubmit: (v: { name: string; sessions: number; price_cents: number; validity_days: number | null; active: boolean }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sessions, setSessions] = useState(String(initial?.sessions ?? 3));
  const [price, setPrice] = useState(initial ? centsToInput(initial.price_cents) : '');
  const [validity, setValidity] = useState(initial?.validity_days ? String(initial.validity_days) : '');
  const [error, setError] = useState<string | null>(null);
  return (
    <form aria-label={initial ? `Editar ${initial.name}` : 'Novo pacote'} className="space-y-4 rounded-2xl border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseMoneyToCents(price);
        if (!cents) return setError('Informe o preço, por exemplo 600,00.');
        setError(null);
        onSubmit({ name, sessions: Number(sessions), price_cents: cents, validity_days: validity ? Number(validity) : null, active: initial?.active ?? true });
      }}>
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pkg-name">Nome</Label><Input id="pkg-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="pkg-sessions">Sessões</Label><Input id="pkg-sessions" type="number" min={1} max={100} value={sessions} onChange={(e) => setSessions(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="pkg-price">Preço (R$)</Label><Input id="pkg-price" inputMode="decimal" placeholder="600,00" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="pkg-validity">Validade em dias (opcional)</Label><Input id="pkg-validity" type="number" min={1} max={730} value={validity} onChange={(e) => setValidity(e.target.value)} /></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar pacote</Button>
      </div>
    </form>
  );
}
