import { ArrowRight, Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ModuleIcon } from '@/components/marketing/module-icon';
import { Reveal } from '@/components/marketing/reveal';
import { SiteFooter } from '@/components/marketing/sections';
import { ShotFrame } from '@/components/marketing/shot';
import { SiteHeader } from '@/components/marketing/site-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { MODULES, moduleBySlug } from '@/lib/marketing/modules';
import { breadcrumbLd, faqLd, softwareLd } from '@/lib/seo/json-ld';
import { absoluteUrl, pageMetadata } from '@/lib/seo/site';
import { cn } from '@/lib/utils';

export const dynamicParams = false;
export const generateStaticParams = () => MODULES.map((m) => ({ slug: m.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const m = moduleBySlug((await params).slug);
  if (!m) return {};
  const meta = pageMetadata({ title: m.title, description: m.description, path: `/recursos/${m.slug}`, absoluteTitle: true, keywords: m.keywords });
  return { ...meta, openGraph: { ...meta.openGraph, images: [{ url: absoluteUrl(m.hero.src), alt: m.hero.alt }] } };
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const m = moduleBySlug((await params).slug);
  if (!m) notFound();
  const others = MODULES.filter((o) => o.slug !== m.slug);
  const phoneHero = m.hero.kind === 'phone';

  return (
    <>
      <JsonLd data={[
        breadcrumbLd([{ name: 'Início', path: '/' }, { name: 'Recursos', path: '/recursos' }, { name: m.name, path: `/recursos/${m.slug}` }]),
        softwareLd(undefined, m.description),
        faqLd(m.faq),
      ]} />
      <SiteHeader />
      <main>
        {/* Topo */}
        <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-primary/[0.07] to-background py-14 lg:py-20">
          <div className={cn('mx-auto grid max-w-6xl items-center gap-12 px-5', phoneHero ? 'lg:grid-cols-[1.1fr_0.9fr]' : 'lg:grid-cols-[0.9fr_1.1fr]')}>
            <div>
              <nav aria-label="Trilha" className="text-sm text-muted-foreground">
                <Link href="/" className="hover:text-foreground">Início</Link> / <Link href="/recursos" className="hover:text-foreground">Recursos</Link> / <span aria-current="page">{m.name}</span>
              </nav>
              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
                <ModuleIcon icon={m.icon} className="size-4" /> {m.name}
              </p>
              <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{m.h1}</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{m.lead}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 px-7 text-base"><Link href="/cadastro">Começar grátis <ArrowRight className="size-4" /></Link></Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base"><Link href="/#planos">Ver planos</Link></Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{m.plan}</p>
            </div>
            <Reveal delay={0.1}><ShotFrame shot={m.hero} priority /></Reveal>
          </div>
        </section>

        {/* Destaques */}
        <section aria-label="Destaques" className="py-12">
          <dl className="mx-auto grid max-w-5xl gap-4 px-5 sm:grid-cols-3">
            {m.highlights.map((h) => (
              <div key={h.label} className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
                <dt className="sr-only">{h.label}</dt>
                <dd className="font-display text-3xl font-semibold text-primary">{h.value}</dd>
                <dd className="mt-1 text-sm text-muted-foreground">{h.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Funcionalidades com as telas */}
        {m.sections.map((s, i) => {
          const phone = s.shot.kind === 'phone';
          const flip = i % 2 === 1;
          return (
            <section key={s.title} aria-labelledby={`sec-${i}`} className={cn('py-16 lg:py-24', i % 2 === 0 && 'bg-muted/30')}>
              <div className={cn('mx-auto grid max-w-6xl items-center gap-12 px-5', phone ? 'lg:grid-cols-[1.2fr_0.8fr]' : 'lg:grid-cols-[0.85fr_1.15fr]')}>
                <Reveal className={cn(flip && 'lg:order-2')}>
                  <p className="text-sm font-semibold uppercase tracking-wider text-primary">{s.eyebrow}</p>
                  <h2 id={`sec-${i}`} className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{s.title}</h2>
                  <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{s.text}</p>
                  <ul className="mt-6 space-y-3">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex gap-3">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" strokeWidth={3} aria-hidden="true" /></span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
                <Reveal delay={0.1} className={cn(flip && 'lg:order-1')}><ShotFrame shot={s.shot} /></Reveal>
              </div>
            </section>
          );
        })}

        {/* Perguntas */}
        <section aria-labelledby="faq-modulo" className="py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-5">
            <h2 id="faq-modulo" className="font-display text-3xl font-semibold tracking-tight">Perguntas frequentes</h2>
            <dl className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card">
              {m.faq.map((f) => (
                <div key={f.q} className="p-6">
                  <dt className="font-semibold">{f.q}</dt>
                  <dd className="mt-2 text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Chamada final */}
        <section className="px-5 pb-16">
          <div className="mx-auto max-w-5xl rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-2xl shadow-primary/20 sm:px-12">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Experimente com os seus pacientes</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg opacity-90">Grátis até 20 pacientes ativos, sem cartão de crédito. Você começa a atender hoje.</p>
            <Button asChild size="lg" variant="secondary" className="mt-8 h-12 px-8 text-base"><Link href="/cadastro">Criar minha conta grátis <ArrowRight className="size-4" /></Link></Button>
          </div>
        </section>

        {/* Outros módulos */}
        <section aria-labelledby="outros" className="border-t border-border/60 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 id="outros" className="font-display text-2xl font-semibold tracking-tight">Conheça também</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/recursos/${o.slug}`} className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ModuleIcon icon={o.icon} className="size-5" /></span>
                    <span><span className="block font-semibold">{o.name}</span><span className="mt-0.5 block text-sm text-muted-foreground">{o.tagline}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
