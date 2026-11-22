import { AdSlot } from '@/components/ads/ad-slot';
import { AdZoneGuard } from '@/components/ads/ad-zone-guard';
import { initials } from '@/components/app/app-nav';
import { AppSidebar } from '@/components/app/app-sidebar';
import { TermsGate } from '@/components/legal/terms-gate';
import { showsAds } from '@/lib/ads/config';
import { getMyOrganizations } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { getPlan } from '@/lib/modules/plans';

const ROLE_LABEL = { owner: 'Responsável', nutritionist: 'Nutricionista', assistant: 'Assistente' } as const;

/**
 * Navegação da área logada: menu lateral fixo no computador e barra com gaveta no celular (AppSidebar).
 * O nome ficou "AppHeader" porque as páginas já o usam no topo. `withSignOut=false` nas pré-visualizações locais.
 */
export async function AppHeader({ homeHref = '/app', patientsHref = '/app/pacientes', withSignOut = true }: { homeHref?: string; patientsHref?: string; withSignOut?: boolean }) {
  const [organizations, user] = withSignOut ? await Promise.all([getMyOrganizations().catch(() => null), getCurrentUser().catch(() => null)]) : [null, null];
  // Plano Gratuito: anúncios só nas telas sem dados de paciente (lib/ads/config.ts).
  const ads = withSignOut && showsAds(organizations);
  const org = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? organizations?.[0] ?? null;
  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email.split('@')[0]! : '';
  return (
    <>
      {withSignOut && <TermsGate profile="professional" />}
      {ads && <AdZoneGuard />}
      <AppSidebar
        homeHref={homeHref}
        patientsHref={patientsHref}
        withSignOut={withSignOut}
        uan={Boolean(organizations?.some((o) => o.plan === 'enterprise_uan' || o.modules?.includes('uan')))}
        publicHealth={Boolean(organizations?.some((o) => o.modules?.includes('public_health')))}
        org={org ? { name: org.name, initials: initials(org.name), planName: getPlan(org.plan).name } : null}
        user={user ? { name: user.first_name || name, initial: ((user.first_name || name)[0] ?? 'R').toUpperCase(), roleLabel: org ? ROLE_LABEL[org.role] : 'Conta' } : null}
      />
      {ads && <AdSlot className="mx-auto mt-4 max-w-7xl px-4 sm:px-5" />}
    </>
  );
}
