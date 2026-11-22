import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayReturn } from '@/components/billing/gateway-return';

const check = vi.fn();
vi.mock('@/lib/billing/actions', () => ({ checkInvoicePayment: (...a: unknown[]) => check(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => { cleanup(); check.mockReset(); });

describe('volta da InfinitePay', () => {
  it('confere o pagamento com slug e transaction_nsu e mostra liberado', async () => {
    check.mockResolvedValue({ ok: true, data: { status: 'paid' } });
    render(<GatewayReturn invoiceId="i1" slug="s1" transactionNsu="t1" />);
    expect(screen.getByText(/Conferindo o pagamento/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Seu plano já está liberado/)).toBeTruthy());
    expect(check).toHaveBeenCalledWith('i1', { slug: 's1', transaction_nsu: 't1' });
  });
  it('ainda não confirmado: explica que libera pelo aviso', async () => {
    check.mockResolvedValue({ ok: true, data: { status: 'open', result: 'unpaid' } });
    render(<GatewayReturn invoiceId="i1" slug="s1" transactionNsu="t1" />);
    await waitFor(() => expect(screen.getByText(/assim que a InfinitePay avisar/)).toBeTruthy());
  });
});
