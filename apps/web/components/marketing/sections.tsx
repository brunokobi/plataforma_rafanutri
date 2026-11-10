import {
  ArrowRight,
  BookOpenText,
  Calculator,
  ChefHat,
  ClipboardList,
  FileText,
  Ruler,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Table2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { PhoneMock } from '@/components/art/product-cards';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HeroVisual } from './hero-visual';
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
  { icon: Table2, label: 'Tabelas TACO e TBCA' },
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

const features = [
  { icon: ClipboardList, title: 'Anamnese por link', text: 'Envie o questionário antes da consulta e receba as respostas organizadas na ficha do paciente.' },
  { icon: Ruler, title: 'Avaliação e composição corporal', text: 'Dobras, circunferências, Jackson & Pollock, Durnin, Faulkner e perfil ISAK, com gráficos de evolução.' },
  { icon: Calculator, title: 'Gasto energético', text: 'Harris-Benedict, Mifflin-St Jeor, Cunningham e FAO/OMS lado a lado, com metas de macros.' },
  { icon: BookOpenText, title: 'Plano alimentar em minutos', text: 'Editor rápido com cálculo em tempo real, medidas caseiras e substituições por equivalência.' },
  { icon: FileText, title: 'PDF com a sua marca', text: 'Plano, pedidos de exames e orientações com seu logo, suas cores e seu CRN.' },
  { icon: ChefHat, title: 'Receitas e recomendações', text: 'Monte sua biblioteca de receitas e envie orientações personalizadas para cada paciente.' },
];

export function Features() {
  return (
    <section id="funcionalidades" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Funcionalidades</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Tudo o que a consulta precisa, sem planilhas
          </h2>
          <p className="mt-4 text-muted-foreground">Do primeiro contato ao acompanhamento, com cálculos validados e tabelas brasileiras.</p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <article className="group h-full rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg hover:shadow-primary/5">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PatientSection() {
  const items = ['Plano do dia com horários e substituições', 'Receitas com foto e modo de preparo', 'Recomendações individuais do nutricionista', 'Seus PDFs sempre à mão'];
  return (
    <section id="paciente" className="scroll-mt-20 bg-forest py-20 text-white lg:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
        <Reveal className="order-2 flex justify-center lg:order-1">
          <div className="relative">
            <div className="absolute -inset-10 rounded-full bg-leaf/25 blur-3xl" />
            <PhoneMock className="relative scale-110" />
          </div>
        </Reveal>
        <Reveal className="order-1 lg:order-2" delay={0.1}>
          <p className="text-sm font-semibold uppercase tracking-wider text-leaf">Para o paciente</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Seu paciente acompanha tudo pelo celular
          </h2>
          <p className="mt-4 text-white/75">
            Uma área exclusiva com a sua marca. Mais adesão ao plano e um vínculo que continua entre as consultas.
          </p>
          <ul className="mt-6 space-y-3">
            {items.map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-leaf/25 text-leaf">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

const plans = [
  {
    name: 'Gratuito',
    price: 'R$ 0',
    note: 'para sempre',
    highlight: true,
    features: ['Até 20 pacientes ativos', 'Anamnese, avaliação e plano alimentar', 'Área do paciente', 'PDF com a sua marca'],
    cta: { label: 'Começar grátis', href: '/cadastro' },
  },
  {
    name: 'Essencial',
    price: 'Em breve',
    note: 'para quem está crescendo',
    features: ['Mais pacientes ativos', 'Tudo do Gratuito', 'Lembretes automáticos'],
  },
  {
    name: 'Profissional',
    price: 'Em breve',
    note: 'para consultórios com volume',
    features: ['Tudo do Essencial', 'Assistente de IA', 'Financeiro e automações de WhatsApp'],
  },
];

export function Pricing() {
  return (
    <section id="planos" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Planos</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Comece sem pagar nada</h2>
          <p className="mt-4 text-muted-foreground">Quando passar de 20 pacientes, seu consultório já estará faturando.</p>
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <article
                className={`relative flex h-full flex-col rounded-2xl border p-7 ${
                  p.highlight ? 'border-primary bg-card shadow-xl shadow-primary/10' : 'border-border bg-card/60'
                }`}
              >
                {p.highlight && <Badge className="absolute -top-3 left-7">Comece por aqui</Badge>}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-3 font-display text-4xl font-semibold">{p.price}</p>
                <p className="text-sm text-muted-foreground">{p.note}</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-primary">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {p.cta ? (
                  <Button asChild className="mt-7 h-11">
                    <Link href={p.cta.href}>{p.cta.label}</Link>
                  </Button>
                ) : (
                  <Button variant="outline" className="mt-7 h-11" disabled>
                    Em breve
                  </Button>
                )}
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const faq = [
  { q: 'O plano gratuito tem prazo?', a: 'Não. Você usa sem pagar com até 20 pacientes ativos. Pacientes arquivados não contam.' },
  { q: 'Preciso instalar alguma coisa?', a: 'Não. A Rafanutri funciona no navegador, no computador e no celular.' },
  { q: 'Quais tabelas de alimentos são usadas?', a: 'Tabelas brasileiras de composição (TACO e TBCA), além dos alimentos e preparações que você cadastrar.' },
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
