// Anúncios do Google AdSense no plano Gratuito (só na área do profissional, nunca com dados de paciente).
// A mesma conta do domínio principal (brunokobi.tech/ads.txt cobre o subdomínio).
import type { UserOrganization } from '@/lib/auth/organizations';

export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-1803671473296579';
/** Bloco fixo (opcional). Sem ele, valem os anúncios automáticos configurados no AdSense. */
export const ADSENSE_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT || '';

/**
 * Telas com anúncio: não mostram dados de paciente. Precisa bater com AD_ZONE_SOURCES (CSP em next.config.ts).
 * Prontuário, pacientes, agenda, CRM, financeiro, faturas, UAN e área do paciente ficam de fora.
 */
export const AD_ZONE_EXACT = ['/app', '/app/configuracoes/plano'];
export const AD_ZONE_PREFIX = ['/app/alimentos', '/app/receitas', '/app/questionarios', '/app/modelos-de-plano', '/app/orientacoes'];

export function isAdZone(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return AD_ZONE_EXACT.includes(p) || AD_ZONE_PREFIX.some((z) => p === z || p.startsWith(`${z}/`));
}

/** Só quem está no Gratuito em todos os consultórios e não tem contrato de UAN vê anúncio. */
export function showsAds(organizations: UserOrganization[] | null): boolean {
  if (!organizations || organizations.length === 0) return false;
  return organizations.every((o) => (o.plan ?? 'free') === 'free' && !(o.modules ?? []).includes('uan'));
}
