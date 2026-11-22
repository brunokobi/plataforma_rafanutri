import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/marketing/sections';
import { SiteHeader } from '@/components/marketing/site-header';
import { JsonLd } from '@/components/seo/json-ld';
import { SOLUTIONS } from '@/lib/marketing/solutions';
import { breadcrumbLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: 'Soluções para todas as áreas da nutrição',
  description: 'Nutrição clínica, esportiva, materno-infantil, UAN, Boas Práticas (RDC 216) e saúde pública: veja o que a Rafanutri faz em cada área.',
  path: '/solucoes',
});

export default function SolutionsPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: 'Início', path: '/' }, { name: 'Soluções', path: '/solucoes' }])} />
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-16 lg:py-24">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Soluções para todas as áreas da nutrição</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">Do consultório à alimentação coletiva: escolha a sua área e veja o que já está pronto para usar.</p>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2">
          {SOLUTIONS.map((s) => (
            <li key={s.slug}>
              <Link href={`/solucoes/${s.slug}`} className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50">
                <h2 className="text-xl font-semibold">{s.name}</h2>
                <p className="mt-2 flex-1 text-muted-foreground">{s.lead}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">Saiba mais <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
