import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuditLog } from '@/lib/audit/actions';
import { AUDIT_ACTION_LABEL, AUDIT_ENTITY_LABEL, type AuditEntry, auditQuery, parseAuditFilters } from '@/lib/audit/types';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';

export const metadata: Metadata = { title: 'Auditoria', robots: { index: false } };
export const dynamic = 'force-dynamic';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';
const when = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

function describe(e: AuditEntry): string {
  const what = AUDIT_ENTITY_LABEL[e.entity] ?? e.entity;
  return `${AUDIT_ACTION_LABEL[e.action]} · ${what}`;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/configuracoes/auditoria');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const org = organizations?.[0] ?? null;

  const filters = parseAuditFilters(await searchParams);
  const result = org?.role === 'owner' ? await getAuditLog(filters) : null;
  const page = result?.ok ? result.page : null;
  const members = page?.members ?? [];
  const base = { ...filters, before: undefined };

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Quem criou, alterou, excluiu, abriu ou exportou dados de pacientes e do financeiro. Mostramos só os nomes dos campos alterados, nunca o conteúdo.
          </p>
        </div>

        {org?.role !== 'owner' ? (
          <Alert><AlertDescription>Só o responsável pelo consultório vê a auditoria.</AlertDescription></Alert>
        ) : (
          <>
            <form method="get" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros da auditoria">
              <div className="space-y-1">
                <Label htmlFor="aud-from">De</Label>
                <Input id="aud-from" name="from" type="date" defaultValue={filters.from} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="aud-to">Até</Label>
                <Input id="aud-to" name="to" type="date" defaultValue={filters.to} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="aud-actor">Pessoa</Label>
                <select id="aud-actor" name="actor" defaultValue={filters.actor ?? ''} className={SELECT}>
                  <option value="">Todas</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="aud-entity">Tipo</Label>
                <select id="aud-entity" name="entity" defaultValue={filters.entity ?? ''} className={SELECT}>
                  <option value="">Todos</option>
                  {Object.entries(AUDIT_ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="aud-action">Ação</Label>
                <select id="aud-action" name="action" defaultValue={filters.action ?? ''} className={SELECT}>
                  <option value="">Todas</option>
                  {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {filters.patient && <input type="hidden" name="patient" value={filters.patient} />}
              <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
                <Button type="submit" size="sm">Filtrar</Button>
                <Button asChild type="button" size="sm" variant="ghost"><Link href="/app/configuracoes/auditoria">Limpar</Link></Button>
              </div>
            </form>

            {!page ? (
              <Alert variant="destructive"><AlertDescription>Não foi possível carregar a auditoria agora. Atualize a página em instantes.</AlertDescription></Alert>
            ) : page.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro com esses filtros.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Registros de auditoria, do mais recente para o mais antigo</caption>
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Quando</th>
                      <th scope="col" className="px-3 py-2 font-medium">Pessoa</th>
                      <th scope="col" className="px-3 py-2 font-medium">O quê</th>
                      <th scope="col" className="px-3 py-2 font-medium">Paciente</th>
                      <th scope="col" className="px-3 py-2 font-medium">Campos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {page.data.map((e) => (
                      <tr key={e.id} className="align-top">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{when.format(new Date(e.occurred_at))}</td>
                        <td className="px-3 py-2">{e.actor?.name ?? <span className="text-muted-foreground">Sem login (link público ou sistema)</span>}</td>
                        <td className="px-3 py-2">{describe(e)}</td>
                        <td className="px-3 py-2">
                          {e.patient ? (
                            <Link className="underline-offset-4 hover:underline" href={`/app/configuracoes/auditoria${auditQuery({ ...base, patient: e.patient.id })}`}>
                              {e.patient.name ?? 'Paciente excluído'}
                            </Link>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.changed_fields.length ? e.changed_fields.join(', ') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {page?.next && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/configuracoes/auditoria${auditQuery({ ...base, before: page.next })}`}>Registros mais antigos</Link>
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Os registros não podem ser alterados nem apagados. Ações repetidas pela mesma pessoa no mesmo item em até 10 minutos aparecem uma vez.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
