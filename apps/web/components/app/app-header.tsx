import { LogOut } from 'lucide-react';
import { AdSlot } from '@/components/ads/ad-slot';
import { AdZoneGuard } from '@/components/ads/ad-zone-guard';
import { AppNav } from '@/components/app/app-nav';
import { FeedbackButton } from '@/components/app/feedback-button';
import { TermsGate } from '@/components/legal/terms-gate';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { showsAds } from '@/lib/ads/config';
import { signOut } from '@/lib/auth/actions';
import { getMyOrganizations } from '@/lib/auth/organizations';

/** Cabeçalho da área logada. `withSignOut=false` nas pré-visualizações locais. */
export async function AppHeader({ homeHref = '/app', patientsHref = '/app/pacientes', withSignOut = true }: { homeHref?: string; patientsHref?: string; withSignOut?: boolean }) {
  // Plano Gratuito: anúncios só nas telas sem dados de paciente (lib/ads/config.ts).
  const ads = withSignOut && showsAds(await getMyOrganizations().catch(() => null));
  return (
    <>
    {withSignOut && <TermsGate profile="professional" />}
    {ads && <AdZoneGuard />}
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-5">
        {/* Atalhos principais + "Mais" no computador; menu lateral abaixo de 1024 px. Nada fica escondido
            atrás dos botões da direita. */}
        <div className="flex min-w-0 items-center gap-2 lg:gap-5">
          <Logo href={homeHref} className="shrink-0" />
          <AppNav homeHref={homeHref} patientsHref={patientsHref} />
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {withSignOut && <FeedbackButton />}
          <ThemeToggle />
          {withSignOut && (
            <form action={signOut}>
              <Button type="submit" variant="outline" aria-label="Sair" title="Sair">
                <LogOut className="size-4" /> <span className="hidden xl:inline">Sair</span>
              </Button>
            </form>
          )}
        </div>
      </div>
    </header>
    {ads && <AdSlot className="mx-auto mt-4 max-w-7xl px-4 sm:px-5" />}
    </>
  );
}
