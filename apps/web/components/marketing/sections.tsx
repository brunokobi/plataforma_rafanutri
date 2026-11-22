import { ArrowRight, Ruler, ShieldCheck, Smartphone, Sparkles, Table2, Users } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HeroVisual } from './hero-visual';
import { PricingCards, type PricingCard } from './pricing-cards';
import { Reveal } from './reveal';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(60%_60%_at_80%_0%,color-mix(in_oklch,var(--leaf)_35%,transparent)_0%,transparent_70%)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 lg:grid-cols-2 lg:pb-24 lg:pt-20">
        <Reveal>
          <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full px-3 py-1 text-xs">
            <Sparkles className="size-3.5" /> Grátis até 20 pacientes, para sempre
          </Badge>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Seu consultório de nutrição <span className="text-primary">em um só lugar</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Anamnese, avaliação, cálculo energético e plano alimentar com substituições em minutos. Seu paciente
            acompanha tudo no celular, com a sua marca.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link href="/cadastro">
                Começar grátis <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
              <a href="#funcionalidades">Ver como funciona</a>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Sem cartão de crédito. Até 20 pacientes ativos no plano gratuito.</p>
        </Reveal>
        <Reveal delay={0.15}>
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}

const trust = [
  { icon: Table2, label: 'TACO, IBGE e USDA' },
  { icon: Ruler, label: 'Protocolos de dobras e ISAK' },
  { icon: Smartphone, label: 'Área do paciente' },
  { icon: ShieldCheck, label: 'Dados isolados por consultório' },
];

export function TrustBar() {
  return (
    <section aria-label="Destaques" className="border-y border-border/60 bg-muted/40">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 text-sm font-medium md:grid-cols-4">
        {trust.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Preços vêm do catálogo de planos (lib/modules/plans.ts); os itens resumem as concessões de cada plano.
const plans: PricingCard[] = [
  { code: 'free', note: 'para sempre', highlight: true, features: ['Até 20 pacientes ativos', 'Anamnese, avaliação e plano alimentar', 'Área do paciente e PDF com a sua marca', 'Assistente de IA: 5 pedidos por dia'] },
  { code: 'essential', note: 'para quem está crescendo', features: ['Até 100 pacientes ativos', 'Financeiro, pacotes e CRM', 'Agendamento online e lembretes por Telegram e e-mail', 'Assistente de IA: 5 pedidos por dia'] },
  { code: 'professional', note: 'para consultórios com volume', features: ['Pacientes ativos sem limite', 'Tudo do Essencial', 'Assistente de IA: 200 pedidos por dia', 'Módulo materno-infantil'] },
  { code: 'clinic', note: 'para equipes', features: ['Tudo do Profissional', 'Equipe sem limite, com papéis e permissões'] },
];

export function Pricing() {
  return (
    <section id="planos" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Planos</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Comece sem pagar nada</h2>
          <p className="mt-4 text-muted-foreground">Quando passar de 20 pacientes, seu consultório já estará faturando. Pague por mês ou por ano, com 50% de desconto no anual.</p>
        </Reveal>
        <PricingCards plans={plans} />
      </div>
    </section>
  );
}

const faq = [
  { q: 'O plano gratuito tem prazo?', a: 'Não. Você usa sem pagar com até 20 pacientes ativos. Pacientes arquivados não contam.' },
  { q: 'Preciso instalar alguma coisa?', a: 'Não. A Rafanutri funciona no navegador, no computador e no celular.' },
  { q: 'Quais tabelas de alimentos são usadas?', a: 'TACO (4ª edição), IBGE (POF 2008-2009), USDA e produtos industrializados pelo rótulo (Open Food Facts), além dos alimentos e preparações que você cadastrar.' },
  { q: 'Meu paciente precisa pagar?', a: 'Não. A área do paciente faz parte da sua conta.' },
  { q: 'Posso usar a minha marca?', a: 'Sim. Seu logo e suas cores aparecem nos PDFs e na área do paciente.' },
];

export function Faq() {
  return (
    <section id="perguntas" className="scroll-mt-20 border-t border-border/60 bg-muted/30 py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Perguntas frequentes</h2>
        </Reveal>
        <Accordion type="single" collapsible className="mt-10">
          {faq.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="py-20 lg:py-28">
      <Reveal className="mx-auto max-w-5xl px-5">
        <div className="relative overflow-hidden rounded-3xl bg-[radial-gradient(120%_120%_at_0%_0%,#3f9a45_0%,#1f5f2b_50%,#0c2e17_100%)] px-8 py-14 text-center text-white sm:px-14">
          <div className="bg-grain absolute inset-0 opacity-25 mix-blend-overlay" />
          <Users className="relative mx-auto size-10 text-leaf" />
          <h2 className="relative mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Atenda melhor, gaste menos tempo com planilhas
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-white/80">Crie sua conta em menos de um minuto. Grátis até 20 pacientes.</p>
          <Button asChild size="lg" variant="secondary" className="relative mt-8 h-12 px-7 text-base">
            <Link href="/cadastro">
              Criar minha conta grátis <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
        <Logo />
        <nav aria-label="Rodapé" className="flex gap-5">
          <Link href="/termos" className="hover:text-foreground">Termos</Link>
          <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
          <Link href="/login" className="hover:text-foreground">Entrar</Link>
        </nav>
        <p>© {new Date().getFullYear()} Rafanutri</p>
      </div>
    </footer>
  );
}
