import { formatCents } from './money';
import { centsInWords } from './in-words';
import { PAYMENT_LABEL, type ReceiptPayload } from './types';

export interface ReceiptPdfData {
  color: string;
  practiceName: string;
  number: string; // "Nº 000012"
  amount: string; // "R$ 250,00"
  amountWords: string;
  payer: string; // "João da Silva, CPF 123.456.789-01"
  service: string;
  paidOn: string; // "10/03/2026"
  method: string | null;
  issuerName: string;
  issuerCrn: string | null;
  issuerTaxId: string | null; // "CPF 123.456.789-01" ou "CNPJ 12.345.678/0001-90"
  place: string; // "14 de novembro de 2026"
}

const HEX = /^#[0-9a-f]{6}$/i;
export const formatCpf = (d: string) => d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
export const formatCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
export const formatTaxId = (d: string) => (d.length === 14 ? `CNPJ ${formatCnpj(d)}` : `CPF ${formatCpf(d)}`);

/** Dados do PDF do recibo (função pura, testável). */
export function receiptPdfData(p: ReceiptPayload): ReceiptPdfData {
  const r = p.receipt;
  const issued = new Date(r.issued_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  return {
    color: p.header.brand_color && HEX.test(p.header.brand_color) ? p.header.brand_color : '#2E7D32',
    practiceName: r.practice_name,
    number: `Nº ${String(r.number).padStart(6, '0')}`,
    amount: formatCents(r.amount_cents),
    amountWords: centsInWords(r.amount_cents),
    payer: r.payer_cpf ? `${r.payer_name}, CPF ${formatCpf(r.payer_cpf)}` : r.payer_name,
    service: r.service,
    paidOn: `${r.paid_at.slice(8, 10)}/${r.paid_at.slice(5, 7)}/${r.paid_at.slice(0, 4)}`,
    method: r.payment_method ? PAYMENT_LABEL[r.payment_method] : null,
    issuerName: r.issuer_name,
    issuerCrn: r.issuer_crn,
    issuerTaxId: r.issuer_tax_id ? formatTaxId(r.issuer_tax_id) : null,
    place: issued,
  };
}

/** "recibo-000012.pdf" */
export const receiptFileName = (n: number) => `recibo-${String(n).padStart(6, '0')}.pdf`;
