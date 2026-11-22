import { ArrowRight, Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/marketing/sections';
import { SiteHeader } from '@/components/marketing/site-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { SOLUTIONS, solutionBySlug } from '@/lib/marketing/solutions';
import { breadcrumbLd, faqLd, softwareLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/site';

export const dynamicParams = false;
export const generateStaticParams = () => SOLUTIONS.map((s) => ({ slug: s.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = solutionBySlug((await params).slug);
  if (!s) return {};
  return pageMetadata({ title: s.title, description: s.description, path: `/solucoes/${s.slug}`, absoluteTitle: true, keywords: s.keywords });
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const s = solutionBySlug((await params).slug);
  if (!s) notFound();
  const others = SOLUTIONS.filter((o) => o.slug !== s.slug);
  const isUan = s.slug === 'uan' || s.slug === 'boas-praticas-rdc-216' || s.slug === 'saude-publica';

  return (
    <>
      <JsonLd data={[
        breadcrumbLd([{ name: 'Início', path: '/' }, { name: 'Soluções', path: '/solucoes' }, { name: s.name, path: `/solucoes/${s.slug}` }]),
        softwareLd(isUan ? [] : undefined, s.description),
        faqLd(s.faq),
      ]} />
      <SiteHeader />
      <main>
        <section className="border-b border-border/60 bg-muted/30 py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-5">
            <nav aria-label="Trilha" className="text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Início</Link> / <Link href="/solucoes" className="hover:text-foreground">Soluções</Link> / <span aria-current="page">{s.name}</span>
            </nav>
            <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{s.h1}</h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{s.lead}</p>
            <p className="mt-3 text-sm text-muted-foreground"><strong className="font-semibold text-foreground">Para quem:</strong> {s.audience}</p>
            <Button asChild size="lg" className="mt-8 h-12 px-7 text-base">
              <Link href={s.cta.href}>{s.cta.label} <ArrowRight className="size-4" /></Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="recursos" className="py-16 lg:py-20">
          <div className="mx-auto max-w-5xl px-5">
            <h2 id="recursos" className="font-display text-3xl font-semibold tracking-tight">O que você faz com a Rafanutri</h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {s.features.map((f) => (
                <li key={f.title} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="flex items-start gap-2 text-lg font-semibold"><Check className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />{f.title}</h3>
                  <p className="mt-2 text-muted-foreground">{f.text}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 text-sm">{s.plan} <Link href="/#planos" className="font-medium text-primary underline-offset-4 hover:underline">Ver planos e preços</Link></p>
          </div>
        </section>

        <section aria-labelledby="duvidas" className="border-t border-border/60 bg-muted/30 py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-5">
            <h2 id="duvidas" className="font-display text-3xl font-semibold tracking-tight">Perguntas frequentes</h2>
            <dl className="mt-8 space-y-6">
              {s.faq.map((f) => (
                <div key={f.q}>
                  <dt className="font-semibold">{f.q}</dt>
                  <dd className="mt-1 text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="outras" className="py-16">
          <div className="mx-auto max-w-5xl px-5">
            <h2 id="outras" className="font-display text-2xl font-semibold tracking-tight">Outras áreas</h2>
            <ul className="mt-6 flex flex-wrap gap-3">
              {others.map((o) => (
                <li key={o.slug}><Link href={`/solucoes/${o.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-muted">{o.name}</Link></li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
