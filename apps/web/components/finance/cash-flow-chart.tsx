'use client';

import { useState } from 'react';
import { formatCents } from '@/lib/finance/money';
import { monthShort, type FinanceSummary } from '@/lib/finance/types';

const INCOME = 'var(--color-primary)';
const EXPENSE = '#C2410C';

/** Receitas × despesas pagas nos últimos 6 meses (barras agrupadas, um eixo, valores na dica e na tabela). */
export function CashFlowChart({ months }: { months: FinanceSummary['months'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 200, padL = 8, padB = 22, padT = 8;
  const max = Math.max(1, ...months.flatMap((m) => [m.income_cents, m.expense_cents]));
  const slot = (W - padL * 2) / months.length;
  const bw = Math.min(28, slot / 3);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const h = (v: number) => (H - padT - padB) * (v / max);
  const shown = hover ?? months.length - 1;
  const m = months[shown];

  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">Receitas × despesas pagas (6 meses)</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="size-2.5 rounded-sm" style={{ background: INCOME }} aria-hidden="true" /> Receitas</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="size-2.5 rounded-sm" style={{ background: EXPENSE }} aria-hidden="true" /> Despesas</span>
      </figcaption>
      {m && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground">{monthShort(m.month)}</span> · receitas {formatCents(m.income_cents)} · despesas {formatCents(m.expense_cents)} · saldo {formatCents(m.income_cents - m.expense_cents)}
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label="Gráfico de receitas e despesas pagas por mês" onMouseLeave={() => setHover(null)}>
        <line x1={padL} x2={W - padL} y1={H - padB} y2={H - padB} stroke="currentColor" strokeOpacity={0.2} />
        {months.map((mo, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={mo.month} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthShort(mo.month)}: receitas ${formatCents(mo.income_cents)}, despesas ${formatCents(mo.expense_cents)}`}>
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill={hover === i ? 'currentColor' : 'transparent'} fillOpacity={0.05} />
              {mo.income_cents > 0 && <rect x={cx - bw - 1} y={y(mo.income_cents)} width={bw} height={Math.max(1, h(mo.income_cents))} rx={3} fill={INCOME} />}
              {mo.expense_cents > 0 && <rect x={cx + 1} y={y(mo.expense_cents)} width={bw} height={Math.max(1, h(mo.expense_cents))} rx={3} fill={EXPENSE} />}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.6}>{monthShort(mo.month)}</text>
            </g>
          );
        })}
      </svg>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ver em tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-muted-foreground"><tr><th className="py-1 font-medium">Mês</th><th className="py-1 text-right font-medium">Receitas</th><th className="py-1 text-right font-medium">Despesas</th><th className="py-1 text-right font-medium">Saldo</th></tr></thead>
          <tbody>
            {months.map((mo) => (
              <tr key={mo.month} className="border-t border-border">
                <td className="py-1">{monthShort(mo.month)}</td>
                <td className="py-1 text-right tabular-nums">{formatCents(mo.income_cents)}</td>
                <td className="py-1 text-right tabular-nums">{formatCents(mo.expense_cents)}</td>
                <td className="py-1 text-right tabular-nums">{formatCents(mo.income_cents - mo.expense_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
