import { AlertCircle, ChefHat, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { LicenseBadge } from '@/components/uan/license-badge';
import { NewUnit } from '@/components/uan/new-unit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { today } from '@/lib/appointments/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { getUanContext } from '@/lib/uan/actions';
import { UNIT_KIND_LABEL, UNIT_ROLE_LABEL } from '@/lib/uan/types';

export const metadata: Metadata = { title: 'UAN e Qualidade', robots: { index: false } };

export default async function UanPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/uan');
  const orgs = await getUanContext();
  const todayDate = today();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">UAN e Qualidade</h1>
          <p className="mt-1 text-sm text-muted-foreground">Unidades produtoras e a equipe de cada uma.</p>
        </div>

        {orgs === null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>Não foi possível carregar as unidades agora. Atualize a página em instantes.</AlertDescription>
          </Alert>
        ) : orgs.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <ChefHat className="size-6 text-primary" />
            <h2 className="mt-3 font-display text-xl font-semibold">O módulo UAN não está habilitado</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O módulo de cozinhas e serviços de alimentação (checklists de Boas Práticas, temperaturas, ficha técnica e estoque) está em
              programa piloto. Fale com a Rafanutri para habilitar na sua empresa.
            </p>
          </div>
        ) : (
          orgs.map((o) => {
            const active = o.units.filter((u) => u.active).length;
            const full = o.unit_limit !== null && active >= o.unit_limit;
            return (
              <section key={o.id} aria-labelledby={`org-${o.id}`} className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id={`org-${o.id}`} className="font-display text-2xl font-semibold tracking-tight">{o.name}</h2>
                  {o.is_owner && o.unit_limit !== null && (
                    <p className="text-sm text-muted-foreground">{active} de {o.unit_limit} unidade(s) ativa(s) no contrato</p>
                  )}
                </div>
                {o.is_owner && (
                  <NewUnit organizationId={o.id} disabled={full} reason={full ? 'Limite do contrato atingido: desative uma unidade ou amplie o contrato.' : undefined} />
                )}
                {o.units.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada ainda.</p>
                ) : (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {o.units.map((u) => (
                      <li key={u.id} className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/app/uan/unidades/${u.id}`} className="font-semibold hover:underline">{u.name}</Link>
                          {!u.active && <Badge variant="secondary">Inativa</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{UNIT_KIND_LABEL[u.kind]}</p>
                        {(u.city || u.state) && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3.5" /> {[u.city, u.state].filter(Boolean).join(' – ')}
                          </p>
                        )}
                        <LicenseBadge expires={u.sanitary_license_expires_at} today={todayDate} className="mt-2" />
                        {u.roles.length > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">Seu papel: {u.roles.map((r) => UNIT_ROLE_LABEL[r]).join(', ')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
