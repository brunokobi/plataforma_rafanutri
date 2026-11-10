import { AiSection, Benefits, Principles, Showcase, Specialties, Toolkit } from '@/components/marketing/more-sections';
import { Faq, FinalCta, Hero, Pricing, SiteFooter, TrustBar } from '@/components/marketing/sections';
import { SiteHeader } from '@/components/marketing/site-header';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <TrustBar />
        <Specialties />
        <Toolkit />
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
