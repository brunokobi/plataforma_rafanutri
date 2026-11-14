import { describe, expect, it } from 'vitest';
import { formatTaxId, receiptFileName, receiptPdfData } from '@/lib/finance/receipt-pdf-data';
import type { ReceiptPayload } from '@/lib/finance/types';

const payload = (over: Partial<ReceiptPayload['receipt']> = {}): ReceiptPayload => ({
  receipt: {
    id: 'r', number: 12, issued_at: '2026-11-14T15:00:00Z', amount_cents: 25050, paid_at: '2026-11-10', payment_method: 'pix', service: 'Consulta de nutrição',
    payer_name: 'João da Silva', payer_cpf: '12345678901', issuer_name: 'Ana Souza', issuer_crn: 'CRN-3 12345', issuer_tax_id: '12345678000190',
    practice_name: 'Consultório Ana', transaction_id: 't', ...over,
  },
  header: { organization_id: 'o', brand_color: '#1565C0' },
});

describe('recibo (RN-055)', () => {
  it('número, valor por extenso, pagador com CPF e emitente com CNPJ', () => {
    const d = receiptPdfData(payload());
    expect(d.number).toBe('Nº 000012');
    expect(d.amount).toBe('R$ 250,50');
    expect(d.amountWords).toBe('duzentos e cinquenta reais e cinquenta centavos');
    expect(d.payer).toBe('João da Silva, CPF 123.456.789-01');
    expect(d.issuerTaxId).toBe('CNPJ 12.345.678/0001-90');
    expect(d.paidOn).toBe('10/11/2026');
    expect(d.method).toBe('Pix');
    expect(d.place).toBe('14 de novembro de 2026');
    expect(d.color).toBe('#1565C0');
  });
  it('sem CPF, sem forma de pagamento e cor inválida', () => {
    const d = receiptPdfData({ ...payload({ payer_cpf: null, payment_method: null, issuer_tax_id: null }), header: { organization_id: 'o', brand_color: 'azul' } });
    expect(d.payer).toBe('João da Silva');
    expect(d.method).toBeNull();
    expect(d.issuerTaxId).toBeNull();
    expect(d.color).toBe('#2E7D32');
    expect(formatTaxId('12345678901')).toBe('CPF 123.456.789-01');
    expect(receiptFileName(7)).toBe('recibo-000007.pdf');
  });
});
