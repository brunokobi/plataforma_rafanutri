import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { brl, dateBR, type Billing } from '@/lib/billing/types';

const push = vi.fn();
const subscribe = vi.fn(async (plan: string) => ({ ok: true as const, plan, data: { invoice: { id: 'inv-1' } } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/lib/billing/actions', () => ({
  subscribe: (p: string) => subscribe(p),
  cancelSubscription: vi.fn(async () => ({ ok: true, data: { until: '2026-12-20' } })),
  resumeSubscription: vi.fn(async () => ({ ok: true })),
}));

const base: Billing = {
  current_plan: 'free', role: 'owner', pix_ready: true, subscription: null, invoices: [],
  plans: [
    { code: 'essential', name: 'Essencial', price_cents: 4990, max_active_patients: 100, max_members: 1 },
    { code: 'clinic', name: 'Clínica', price_cents: 19990, max_active_patients: null, max_members: null },
  ],
};

afterEach(cleanup);

describe('assinatura por Pix', () => {
  it('formata valor e data', () => {
    expect(brl(4990).replace(/\s/g, ' ')).toBe('R$ 49,90');
    expect(dateBR('2026-11-25')).toBe('25/11/2026');
    expect(dateBR(null)).toBe('—');
  });

  it('owner assina e vai para a fatura', async () => {
    const { SubscriptionPanel } = await import('@/components/billing/subscription-panel');
    render(<SubscriptionPanel billing={base} />);
    expect(screen.getByText('Essencial')).toBeTruthy();
    expect(screen.getByText('Agenda, avisos no Telegram e financeiro')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Assinar com Pix' })[0]!));
    expect(subscribe).toHaveBeenCalledWith('essential');
    expect(push).toHaveBeenCalledWith('/app/configuracoes/plano/fatura/inv-1');
  });

  it('assinatura ativa mostra plano atual, fatura em aberto e troca', async () => {
    const { SubscriptionPanel } = await import('@/components/billing/subscription-panel');
    render(<SubscriptionPanel billing={{
      ...base, current_plan: 'essential',
      subscription: { plan: 'essential', next_plan: null, status: 'active', current_period_end: '2026-12-20', cancel_at_period_end: false },
      invoices: [{ id: 'i2', plan: 'essential', amount_cents: 4990, period_start: '2026-12-21', period_end: '2027-01-20', due_on: '2026-12-20', status: 'open', txid: 'RNX', reported_paid_at: null, paid_at: null }],
    }} />);
    expect(screen.getByRole('button', { name: 'Plano atual' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trocar para este' })).toBeTruthy();
    expect(screen.getByText(/Fatura em aberto/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pagar com Pix' }).getAttribute('href')).toBe('/app/configuracoes/plano/fatura/i2');
  });

  it('quem não é owner só vê', async () => {
    const { SubscriptionPanel } = await import('@/components/billing/subscription-panel');
    render(<SubscriptionPanel billing={{ ...base, role: 'nutritionist' }} />);
    expect(screen.queryByRole('button', { name: 'Assinar com Pix' })).toBeNull();
    expect(screen.getByText(/Só o responsável/)).toBeTruthy();
  });

  it('sem Pix configurado: planos em breve', async () => {
    const { SubscriptionPanel } = await import('@/components/billing/subscription-panel');
    render(<SubscriptionPanel billing={{ ...base, pix_ready: false }} />);
    expect(screen.getByText(/abrem em breve/)).toBeTruthy();
  });
});
