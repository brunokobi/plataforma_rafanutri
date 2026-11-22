import { PLANS, type PlanCode } from '@/lib/modules/plans';
import { SITE_NAME, SITE_URL, absoluteUrl } from './site';

type Thing = Record<string, unknown>;

/** Serializa para <script type="application/ld+json"> sem permitir fechar a tag (</script>). */
export const jsonLdString = (data: Thing | Thing[]) => JSON.stringify(data).replace(/</g, '\\u003c');

export const organizationLd = (): Thing => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: absoluteUrl('/icon.svg'),
});

export const websiteLd = (): Thing => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: 'pt-BR',
  publisher: { '@id': `${SITE_URL}/#organization` },
});

const price = (cents: number) => (cents / 100).toFixed(2);

/** O app como SoftwareApplication, com as ofertas dos planos (preço mensal em reais). */
export function softwareLd(codes: PlanCode[] = ['free', 'essential', 'professional', 'clinic'], description?: string): Thing {
  const offers = codes.map((c) => PLANS.find((p) => p.code === c)).filter((p): p is (typeof PLANS)[number] => p?.monthlyCents != null)
    .map((p) => ({ '@type': 'Offer', name: `Plano ${p.name}`, price: price(p.monthlyCents ?? 0), priceCurrency: 'BRL', url: absoluteUrl('/#planos') }));
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'HealthApplication',
    applicationSubCategory: 'Software para nutricionistas',
    operatingSystem: 'Web, Android, iOS (navegador)',
    url: SITE_URL,
    inLanguage: 'pt-BR',
    description: description ?? 'Software para nutricionistas: anamnese, avaliação, cálculo energético, plano alimentar, área do paciente e gestão do consultório.',
    publisher: { '@id': `${SITE_URL}/#organization` },
    ...(offers.length ? { offers } : {}),
  };
}

export const faqLd = (items: ReadonlyArray<{ q: string; a: string }>): Thing => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

export const breadcrumbLd = (items: ReadonlyArray<{ name: string; path: string }>): Thing => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absoluteUrl(it.path) || SITE_URL })),
});
