import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { MODULES } from '@/lib/marketing/modules';
import { ModuleIcon } from './module-icon';
import { Reveal } from './reveal';

/** Página inicial: um cartão por módulo, com a tela real, levando à página de detalhes. */
export function ModulesSection() {
  return (
    <section id="modulos" aria-labelledby="modulos-titulo" className="scroll-mt-20 border-y border-border/60 bg-muted/30 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Conheça cada módulo</p>
          <h2 id="modulos-titulo" className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Veja as telas de verdade antes de criar a sua conta</h2>
          <p className="mt-4 text-muted-foreground">Cada módulo tem uma página com as telas do sistema e tudo o que ele faz, em detalhe.</p>
        </Reveal>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <li key={m.slug} className="h-full">
              <Reveal delay={(i % 3) * 0.06} className="h-full">
                <Link href={`/recursos/${m.slug}`} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-muted">
                    <Image src={m.hero.src} alt="" fill sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                      className={m.hero.kind === 'phone' ? 'object-cover object-top px-16 pt-5 transition-transform duration-500 group-hover:scale-[1.03]' : 'object-cover object-left-top transition-transform duration-500 group-hover:scale-[1.03]'} />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="flex items-center gap-2.5 text-lg font-semibold">
                      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><ModuleIcon icon={m.icon} className="size-5" /></span>
                      {m.name}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{m.tagline}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">Ver telas e detalhes <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
                  </div>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
