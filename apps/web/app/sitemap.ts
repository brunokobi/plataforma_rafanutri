import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { SOLUTIONS } from '@/lib/marketing/solutions';
import { MODULES } from '@/lib/marketing/modules';
import { absoluteUrl } from '@/lib/seo/site';

export const revalidate = 3600;

/** Páginas públicas dos consultórios (só as publicadas), vindas do Directus; sem resposta, ficam de fora. */
async function practicePages(): Promise<MetadataRoute.Sitemap> {
  try {
    const r = await fetch(`${env.DIRECTUS_URL}/rafanutri/public/practices`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { data?: Array<{ slug: string; updated_at: string | null }> };
    return (j.data ?? []).map((p) => ({ url: absoluteUrl(`/n/${p.slug}`), lastModified: p.updated_at ?? undefined, changeFrequency: 'weekly', priority: 0.6 }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/recursos'), changeFrequency: 'monthly', priority: 0.9 },
    ...MODULES.map((m) => ({ url: absoluteUrl(`/recursos/${m.slug}`), changeFrequency: 'monthly' as const, priority: 0.9 })),
    { url: absoluteUrl('/solucoes'), changeFrequency: 'monthly', priority: 0.8 },
    ...SOLUTIONS.map((s) => ({ url: absoluteUrl(`/solucoes/${s.slug}`), changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: absoluteUrl('/cadastro'), changeFrequency: 'monthly', priority: 0.6 },
    ...['/termos', '/termos/paciente', '/privacidade'].map((path) => ({ url: absoluteUrl(path), changeFrequency: 'yearly' as const, priority: 0.3 })),
  ];
  return [...fixed, ...(await practicePages())];
}
