import { SiteHeader } from '@/components/marketing/site-header';
import { Faq, Features, FinalCta, Hero, PatientSection, Pricing, SiteFooter, TrustBar } from '@/components/marketing/sections';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <TrustBar />
        <Features />
        <PatientSection />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
