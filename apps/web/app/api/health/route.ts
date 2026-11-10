export const dynamic = 'force-dynamic';

/** Verificação de saúde para o Coolify e o Docker (não depende de serviços externos). */
export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
