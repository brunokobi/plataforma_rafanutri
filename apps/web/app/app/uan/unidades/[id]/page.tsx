import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { LicenseBadge } from '@/components/uan/license-badge';
import { UnitForm } from '@/components/uan/unit-form';
import { UnitTeam } from '@/components/uan/unit-team';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { today } from '@/lib/appointments/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { getUnit } from '@/lib/uan/actions';
import { formatCnpj, UNIT_KIND_LABEL, UNIT_ROLE_LABEL } from '@/lib/uan/types';

export const metadata: Metadata = { title: 'Unidade', robots: { index: false } };

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}`);
  const detail = await getUnit(id);
  if (detail === undefined) notFound();
  const todayDate = today();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-8 px-5 py-10">
        <Link href="/app/uan" className="text-sm text-muted-foreground hover:underline">← Unidades</Link>
        {detail === null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>Não foi possível carregar a unidade agora. Atualize a página em instantes.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{detail.unit.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {UNIT_KIND_LABEL[detail.unit.kind]}
                {detail.unit.cnpj && ` · CNPJ ${formatCnpj(detail.unit.cnpj)}`}
                {!detail.unit.active && ' · inativa'}
              </p>
              <LicenseBadge expires={detail.unit.sanitary_license_expires_at} today={todayDate} className="mt-2" />
            </div>

            {detail.can_edit ? (
              <UnitForm unit={detail.unit} canToggleActive={detail.is_owner} />
            ) : (
              <dl className="grid gap-3 rounded-2xl border border-border bg-card p-5 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Endereço</dt><dd>{[detail.unit.address, detail.unit.city, detail.unit.state].filter(Boolean).join(', ') || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Alvará sanitário</dt><dd>{detail.unit.sanitary_license || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Seu papel</dt><dd>{detail.roles.map((r) => UNIT_ROLE_LABEL[r]).join(', ')}</dd></div>
              </dl>
            )}

            {detail.can_manage_team && (
              <UnitTeam
                unitId={detail.unit.id}
                unitName={detail.unit.name}
                unitActive={detail.unit.active}
                members={detail.members}
                invites={detail.invites ?? []}
                invitableRoles={detail.invitable_roles ?? []}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
