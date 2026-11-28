import type { Metadata } from 'next';
import { ModulesSection } from '@/components/marketing/modules-section';
import { FinalCta, SiteFooter } from '@/components/marketing/sections';
import { SiteHeader } from '@/components/marketing/site-header';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: 'Recursos da Rafanutri: telas de cada módulo',
  description: 'Consultório clínico, app do paciente com metas e água, mensagens, gestão, esportivo, materno-infantil, IA, UAN e saúde pública, com as telas reais.',
  path: '/recursos',
  keywords: ['software para nutricionista', 'recursos', 'app do paciente', 'plano alimentar'],
});

export default function ResourcesPage() {
  return (
    <>
      <JsonLd data={[breadcrumbLd([{ name: 'Início', path: '/' }, { name: 'Recursos', path: '/recursos' }])]} />
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-b from-primary/[0.07] to-background pb-4 pt-16 text-center">
          <div className="mx-auto max-w-3xl px-5">
            <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Tudo o que a Rafanutri faz, tela por tela</h1>
            <p className="mt-5 text-lg text-muted-foreground">Escolha um módulo para ver as telas do sistema e cada funcionalidade em detalhe.</p>
          </div>
        </section>
        <ModulesSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
