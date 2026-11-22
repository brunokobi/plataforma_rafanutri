'use client';

import { Check, ChevronLeft, ChevronRight, Download, FileText, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createFinanceCategory, createTransaction, deleteTransaction, issueReceipt, updateTransaction } from '@/lib/finance/actions';
import { centsToInput, formatCents, parseMoneyToCents } from '@/lib/finance/money';
import {
  isOverdue, KIND_LABEL, monthLong, PAYMENT_LABEL, periodTotals, shiftMonth, STATUS_LABEL,
  type AppointmentPrefill, type FinanceCategory, type FinanceResult, type FinanceSummary, type PaymentMethod, type Transaction, type TransactionInput, type TransactionList, type TxKind, type TxStatus,
} from '@/lib/finance/types';
import { cn } from '@/lib/utils';
import { CashFlowChart } from './cash-flow-chart';
import { isoToBR as dateBR } from '@/lib/format/date';

const inputOf = (t: Transaction): TransactionInput => ({
  kind: t.kind, category_id: t.category_id, description: t.description, amount_cents: t.amount_cents, due_date: t.due_date, status: t.status,
  paid_at: t.paid_at, payment_method: t.payment_method, patient_id: t.patient_id, appointment_id: t.appointment_id, notes: t.notes,
});

interface Props {
  month: string;
  list: TransactionList;
  summary: FinanceSummary | null;
  categories: FinanceCategory[];
  patients: Array<{ id: string; full_name: string }>;
  prefill: AppointmentPrefill | null;
}

/** RN-053 — Financeiro do consultório: mês, a receber, gráfico de 6 meses, lançamentos e CSV. */
export function FinanceView({ month, list, summary, categories: initialCategories, patients, prefill }: Props) {
  const [mode, setMode] = useState<'none' | 'new' | { edit: Transaction }>(prefill && !prefill.existing ? 'new' : 'none');
  const [filter, setFilter] = useState<'all' | TxKind | 'open'>('all');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    prefill?.existing ? { ok: false, text: `A consulta de ${prefill.patient_name} já tem um recebimento registrado.` } : null,
  );
  const [pending, start] = useTransition();
  const [categories, setCategories] = useState(initialCategories);
  const totals = useMemo(() => periodTotals(list.transactions, list.today), [list]);
  const shown = list.transactions.filter((t) => (filter === 'all' ? true : filter === 'open' ? t.status === 'open' : t.kind === filter));

  function run(fn: () => Promise<FinanceResult>, ok: string, close = true) {
    setFeedback(null);
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, text: ok } : { ok: false, text: r.message });
      if (r.ok && close) setMode('none');
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Financeiro</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link href="/app/financeiro/pacotes">Pacotes</Link></Button>
          <Button asChild variant="outline" size="sm"><a href={`/app/financeiro/csv?mes=${month}`} download><Download className="size-4" /> Exportar CSV</a></Button>
          {mode === 'none' && <Button type="button" onClick={() => { setMode('new'); setFeedback(null); }}><Plus className="size-4" /> Novo lançamento</Button>}
        </div>
      </div>

      <nav aria-label="Mês" className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link href={`/app/financeiro?mes=${shiftMonth(month, -1)}`} aria-label="Mês anterior"><ChevronLeft className="size-4" /></Link></Button>
        <p className="min-w-40 text-center font-medium capitalize">{monthLong(month)}</p>
        <Button asChild variant="ghost" size="sm"><Link href={`/app/financeiro?mes=${shiftMonth(month, 1)}`} aria-label="Próximo mês"><ChevronRight className="size-4" /></Link></Button>
      </nav>

      <section aria-label="Resumo do mês" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Recebido no mês" value={formatCents(totals.income)} />
        <Stat label="Pago no mês" value={formatCents(totals.expense)} />
        <Stat label="Saldo do mês" value={formatCents(totals.balance)} />
        <div role="group" aria-label="A receber" className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">A receber (todos os meses)</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatCents(summary?.receivable.total_cents ?? 0)}</p>
          {summary && summary.receivable.overdue_count > 0 ? (
            <p className="mt-1 text-sm font-medium text-destructive">{summary.receivable.overdue_count} atrasado{summary.receivable.overdue_count > 1 ? 's' : ''} · {formatCents(summary.receivable.overdue_cents)}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Nada atrasado</p>
          )}
        </div>
      </section>

      {summary && <section className="rounded-2xl border border-border bg-card p-5"><CashFlowChart months={summary.months} /></section>}

      {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}

      {mode === 'new' && (
        <TransactionForm categories={categories} patients={patients} today={list.today} pending={pending} prefill={prefill && !prefill.existing ? prefill : null}
          onCategory={(kind, name) => start(async () => {
            const r = await createFinanceCategory(kind, name);
            setFeedback(r.ok ? { ok: true, text: `Categoria "${r.category.name}" criada.` } : { ok: false, text: r.message });
            if (r.ok) setCategories((c) => [...c, r.category]);
          })}
          onCancel={() => setMode('none')} onSubmit={(v) => run(() => createTransaction(v), v.status === 'paid' ? 'Lançamento registrado como pago.' : 'Lançamento registrado.')} />
      )}
      {typeof mode === 'object' && (
        <TransactionForm initial={mode.edit} categories={categories} patients={patients} today={list.today} pending={pending} prefill={null}
          onCategory={() => undefined} onCancel={() => setMode('none')} onSubmit={(v) => run(() => updateTransaction(mode.edit.id, v), 'Lançamento atualizado.')} />
      )}

      <section aria-labelledby="lancamentos" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="lancamentos" className="font-display text-xl font-semibold">Lançamentos do mês</h2>
          <div className="ml-auto flex flex-wrap gap-1" role="group" aria-label="Filtrar lançamentos">
            {([['all', 'Todos'], ['income', 'Receitas'], ['expense', 'Despesas'], ['open', 'Em aberto']] as const).map(([k, label]) => (
              <Button key={k} type="button" size="sm" variant={filter === k ? 'default' : 'ghost'} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</Button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum lançamento {filter === 'all' ? 'neste mês' : 'com esse filtro'}.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Lançamentos">
            {shown.map((t) => {
              const overdue = isOverdue(t, list.today);
              return (
                <li key={t.id} className={cn('flex flex-wrap items-center gap-3 p-4', t.status === 'cancelled' && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{t.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {KIND_LABEL[t.kind]} · {t.category_name}{t.patient_name ? ` · ${t.patient_name}` : ''} · vence {dateBR(t.due_date)}
                      {t.paid_at ? ` · pago em ${dateBR(t.paid_at)}${t.payment_method ? ` (${PAYMENT_LABEL[t.payment_method]})` : ''}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('font-semibold tabular-nums', t.status === 'cancelled' && 'line-through')}>{t.kind === 'expense' ? '− ' : ''}{formatCents(t.amount_cents)}</p>
                    <p className={cn('text-xs', overdue ? 'font-medium text-destructive' : t.status === 'paid' ? 'text-primary' : 'text-muted-foreground')}>{overdue ? 'Atrasado' : STATUS_LABEL[t.status]}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.kind === 'income' && t.status === 'paid' && (
                      t.receipt_id ? (
                        <Button asChild size="sm" variant="outline"><a href={`/app/financeiro/recibos/${t.receipt_id}/pdf`} download aria-label={`Baixar recibo: ${t.description}`}><FileText className="size-4" /> Recibo</a></Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`Emitir recibo: ${t.description}`}
                          onClick={() => {
                            const payer = t.patient_name ? undefined : window.prompt('Nome de quem pagou (vai no recibo):')?.trim();
                            if (!t.patient_name && !payer) return;
                            setFeedback(null);
                            start(async () => {
                              const r = await issueReceipt(t.id, payer ? { payer_name: payer } : undefined);
                              if (!r.ok) return setFeedback({ ok: false, text: r.message });
                              setFeedback({ ok: true, text: 'Recibo emitido.' });
                              // baixa o PDF (rota de arquivo, não página)
                              const a = document.createElement('a');
                              a.href = `/app/financeiro/recibos/${r.receiptId}/pdf`;
                              a.download = '';
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                            });
                          }}><FileText className="size-4" /> Emitir recibo</Button>
                      )
                    )}
                    {t.status === 'open' && (
                      <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`Marcar como pago: ${t.description}`}
                        onClick={() => run(() => updateTransaction(t.id, { ...inputOf(t), status: 'paid', paid_at: list.today }), 'Marcado como pago.')}><Check className="size-4" /> Pago</Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" disabled={pending || mode !== 'none'} aria-label={`Editar ${t.description}`} onClick={() => { setMode({ edit: t }); setFeedback(null); }}><Pencil className="size-4" /></Button>
                    {t.status !== 'cancelled' && (
                      <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Cancelar ${t.description}`}
                        onClick={() => { if (window.confirm(`Cancelar "${t.description}"? Ele deixa de contar no caixa e no a receber.`)) run(() => updateTransaction(t.id, { ...inputOf(t), status: 'cancelled', paid_at: null }), 'Lançamento cancelado.'); }}><X className="size-4" /></Button>
                    )}
                    {list.can_delete && !t.receipt_id && (
                      <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Excluir ${t.description}`}
                        onClick={() => { if (window.confirm(`Excluir "${t.description}"? Não dá para desfazer.`)) run(() => deleteTransaction(t.id), 'Lançamento excluído.'); }}><Trash2 className="size-4" /></Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TransactionForm({ initial, categories, patients, today, pending, prefill, onSubmit, onCancel, onCategory }: {
  initial?: Transaction;
  categories: FinanceCategory[];
  patients: Array<{ id: string; full_name: string }>;
  today: string;
  pending: boolean;
  prefill: AppointmentPrefill | null;
  onSubmit: (v: TransactionInput) => void;
  onCancel: () => void;
  onCategory: (kind: TxKind, name: string) => void;
}) {
  const consultaCat = categories.find((c) => c.kind === 'income' && c.name === (prefill?.type === 'return' ? 'Retorno' : 'Consulta'));
  const [kind, setKind] = useState<TxKind>(initial?.kind ?? 'income');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? (prefill ? consultaCat?.id ?? '' : ''));
  const [description, setDescription] = useState(initial?.description ?? (prefill ? `${prefill.type === 'return' ? 'Retorno' : 'Consulta'} — ${prefill.patient_name}` : ''));
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amount_cents) : prefill?.last_amount_cents ? centsToInput(prefill.last_amount_cents) : '');
  const [due, setDue] = useState(initial?.due_date ?? today);
  const [status, setStatus] = useState<TxStatus>(initial?.status ?? (prefill ? 'paid' : 'open'));
  const [paidAt, setPaidAt] = useState(initial?.paid_at ?? today);
  const [method, setMethod] = useState<PaymentMethod | ''>(initial?.payment_method ?? (prefill ? 'pix' : ''));
  const [patientId, setPatientId] = useState(initial?.patient_id ?? prefill?.patient_id ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [newCat, setNewCat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const kindCats = categories.filter((c) => c.kind === kind);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoneyToCents(amount);
    if (!cents) return setError('Informe um valor maior que zero, por exemplo 250,00.');
    if (!categoryId) return setError('Escolha a categoria.');
    setError(null);
    onSubmit({
      kind, category_id: categoryId, description, amount_cents: cents, due_date: due, status,
      paid_at: status === 'paid' ? paidAt : null, payment_method: method || null,
      patient_id: kind === 'income' ? patientId || null : null,
      appointment_id: kind === 'income' ? initial?.appointment_id ?? prefill?.id ?? null : null,
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} aria-label={initial ? `Editar ${initial.description}` : 'Novo lançamento'} className="space-y-4 rounded-2xl border border-border bg-card p-5">
      {prefill && <p className="text-sm text-muted-foreground">Pagamento da consulta de <span className="font-medium text-foreground">{prefill.patient_name}</span>.</p>}
      <div role="radiogroup" aria-label="Tipo" className="flex gap-2">
        {(['income', 'expense'] as const).map((k) => (
          <Button key={k} type="button" role="radio" aria-checked={kind === k} variant={kind === k ? 'default' : 'outline'} disabled={Boolean(initial) || Boolean(prefill)}
            onClick={() => { setKind(k); setCategoryId(''); }}>{KIND_LABEL[k]}</Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tx-description">Descrição</Label>
          <Input id="tx-description" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-amount">Valor (R$)</Label>
          <Input id="tx-amount" inputMode="decimal" placeholder="250,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-category">Categoria</Label>
          <select id="tx-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">Escolha…</option>
            {kindCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!initial && (
            <div className="flex gap-2 pt-1">
              <Input aria-label="Nova categoria" placeholder="Nova categoria" value={newCat} maxLength={40} onChange={(e) => setNewCat(e.target.value)} />
              <Button type="button" variant="outline" size="sm" disabled={pending || newCat.trim().length < 2} onClick={() => { onCategory(kind, newCat.trim()); setNewCat(''); }}>Criar</Button>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-due">Vencimento</Label>
          <Input id="tx-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-status">Situação</Label>
          <select id="tx-status" value={status} onChange={(e) => setStatus(e.target.value as TxStatus)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="open">Em aberto</option>
            <option value="paid">Pago</option>
            {initial && <option value="cancelled">Cancelado</option>}
          </select>
        </div>
        {status === 'paid' && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="tx-paid">Pago em</Label>
              <Input id="tx-paid" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-method">Forma de pagamento</Label>
              <select id="tx-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">Não informar</option>
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((k) => <option key={k} value={k}>{PAYMENT_LABEL[k]}</option>)}
              </select>
            </div>
          </>
        )}
        {kind === 'income' && (
          <div className="space-y-1.5">
            <Label htmlFor="tx-patient">Paciente (opcional)</Label>
            <select id="tx-patient" value={patientId} disabled={Boolean(prefill)} onChange={(e) => setPatientId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Nenhum</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              {prefill && !patients.some((p) => p.id === prefill.patient_id) && <option value={prefill.patient_id}>{prefill.patient_name}</option>}
            </select>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tx-notes">Observação (opcional)</Label>
        <Input id="tx-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
      </div>
    </form>
  );
}
