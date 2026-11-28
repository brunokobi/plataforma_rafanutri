import { AiSection, Benefits, Principles, Showcase, Specialties, Toolkit } from '@/components/marketing/more-sections';
import { Faq, FinalCta, Hero, Pricing, SiteFooter, TrustBar } from '@/components/marketing/sections';
import { SiteHeader } from '@/components/marketing/site-header';
import { ModulesSection } from '@/components/marketing/modules-section';
import { faq } from '@/components/marketing/sections';
import { JsonLd } from '@/components/seo/json-ld';
import { faqLd, organizationLd, softwareLd, websiteLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/site';
import type { Metadata } from 'next';

export const metadata: Metadata = pageMetadata({
  title: 'Rafanutri — software para nutricionista, grátis até 20 pacientes',
  description: 'Anamnese, avaliação, cálculo energético e plano alimentar com TACO em minutos, área do paciente e PDF com a sua marca. Comece grátis com até 20 pacientes.',
  path: '/',
  absoluteTitle: true,
  keywords: ['software para nutricionista', 'programa para nutricionista', 'plano alimentar', 'sistema para nutricionista grátis', 'consultório de nutrição'],
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={[organizationLd(), websiteLd(), softwareLd(), faqLd(faq)]} />
      <SiteHeader />
      <main>
        <Hero />
        <TrustBar />
        <Specialties />
        <Toolkit />
        <ModulesSection />
        <Showcase />
        <AiSection />
        <Benefits />
        <Principles />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
