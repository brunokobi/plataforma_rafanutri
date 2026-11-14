import { getTransactions } from '@/lib/finance/actions';
import { monthRange, transactionsCsv } from '@/lib/finance/types';

export const dynamic = 'force-dynamic';

/** RN-053 — Exportação CSV do mês (?mes=aaaa-mm), com a sessão do usuário. */
export async function GET(req: Request) {
  const mes = new URL(req.url).searchParams.get('mes') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return new Response('Mês inválido.', { status: 400 });
  const { from, to } = monthRange(mes);
  const list = await getTransactions(from, to);
  if (!list) return new Response('Não foi possível exportar agora.', { status: 502 });
  return new Response(transactionsCsv(list.transactions), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="financeiro-${mes}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
