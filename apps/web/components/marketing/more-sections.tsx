import {
  Apple,
  BellRing,
  Brain,
  CalendarCheck,
  ClipboardCheck,
  FileHeart,
  FlaskConical,
  HandCoins,
  HeartHandshake,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Palette,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Wallet,
  Baby,
} from 'lucide-react';
import { PhoneMock } from '@/components/art/product-cards';
import { Badge } from '@/components/ui/badge';
import { Reveal } from './reveal';

function SoonBadge({ label = 'Em breve' }: { label?: string }) {
  return (
    <Badge variant="outline" className="ml-2 align-middle text-[10px] font-medium">
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Áreas de atuação
// ---------------------------------------------------------------------------
const areas = [
  'Emagrecimento', 'Hipertrofia', 'Nutrição esportiva', 'Diabetes', 'Hipertensão', 'Saúde cardiovascular',
  'Saúde intestinal', 'Intolerâncias alimentares', 'Vegetarianos e veganos', 'Saúde da mulher', 'Menopausa',
  'Gestantes', 'Pós-parto e lactação', 'Pediatria', 'Idosos', 'Nutrição comportamental', 'Oncologia',
  'Doenças autoimunes', 'Uso de canetas emagrecedoras', 'Alimentação saudável',
];

export function Specialties() {
  return (
    <section aria-labelledby="areas" className="py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Para todas as áreas da nutrição</p>
          <h2 id="areas" className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Do consultório à nutrição esportiva e materno-infantil
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <ul className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-2.5">
            {areas.map((a) => (
              <li key={a} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm">
                {a}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            A conduta clínica é sempre do nutricionista. A Rafanutri organiza, calcula e acompanha.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Muito mais para o seu consultório (grade de recursos)
// ---------------------------------------------------------------------------
const toolkit: Array<{ icon: typeof Apple; title: string; text: string; soon?: boolean }> = [
  { icon: ClipboardCheck, title: 'Anamnese completa', text: 'Use nossos modelos ou crie os seus, com perguntas condicionais. Nenhum detalhe se perde.' },
  { icon: FileHeart, title: 'Questionários pré-consulta', text: 'Envie por link antes da consulta e chegue com o histórico do paciente já organizado.' },
  { icon: Apple, title: 'Base de alimentos brasileira', text: 'TACO e TBCA, com medidas caseiras e espaço para os seus alimentos e preparações.' },
  { icon: Scale, title: 'Avaliação física completa', text: 'Dobras, circunferências, protocolos clássicos e perfil ISAK, com gráficos de evolução.' },
  { icon: Target, title: 'Metas e check-ins', text: 'Defina metas para cada paciente e acompanhe a adesão pela área do paciente.', soon: true },
  { icon: Baby, title: 'Materno-infantil', text: 'Curvas de crescimento da OMS, ganho de peso gestacional e introdução alimentar.', soon: true },
  { icon: Wallet, title: 'Financeiro do consultório', text: 'Recebimentos, pacotes de consultas e recibos com a sua marca.', soon: true },
  { icon: BellRing, title: 'Lembretes automáticos', text: 'Consultas e retornos lembrados pelo WhatsApp e e-mail, para reduzir faltas.', soon: true },
  { icon: Palette, title: 'Materiais com a sua marca', text: 'Orientações e conteúdos educativos prontos para entregar ou postar.', soon: true },
];

export function Toolkit() {
  return (
    <section id="funcionalidades" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Funcionalidades</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Muito mais para você e o seu consultório</h2>
          <p className="mt-4 text-muted-foreground">
            Lançamento em etapas: os itens marcados como &ldquo;em breve&rdquo; chegam nas próximas versões.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {toolkit.map(({ icon: Icon, title, text, soon }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.06}>
              <article className="flex gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">
                    {title}
                    {soon && <SoonBadge />}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Vitrine do editor de prescrição
// ---------------------------------------------------------------------------
const meals = [
  { time: '07:30', name: 'Café da manhã', p: 22.4, c: 48.1 },
  { time: '12:30', name: 'Almoço', p: 38.6, c: 62.3 },
  { time: '16:00', name: 'Lanche', p: 18.2, c: 31.5 },
  { time: '20:00', name: 'Jantar', p: 30.1, c: 40.2 },
];

function PrescriptionMock() {
  // Distribuição ilustrativa: proteína 24%, carboidrato 49%, gorduras 27%
  const ring = 'conic-gradient(var(--primary) 0 24%, var(--peach) 24% 73%, var(--lemon) 73% 100%)';
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-xl">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-primary/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Plano para dias de treino</p>
            <p className="text-xs text-muted-foreground">Paciente: Juliana M.</p>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">Rascunho</span>
        </div>
        <ul className="mt-4 space-y-2">
          {meals.map((m) => (
            <li key={m.time} className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 text-xs">
              <span className="w-10 font-semibold tabular-nums">{m.time}</span>
              <span className="flex-1 font-medium">{m.name}</span>
              <span className="rounded-md bg-card px-1.5 py-0.5 tabular-nums">P {m.p.toFixed(1)} g</span>
              <span className="rounded-md bg-card px-1.5 py-0.5 tabular-nums">C {m.c.toFixed(1)} g</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-border p-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-1 text-left font-medium">Nutriente</th>
                <th className="pb-1 text-right font-medium">Prescrito</th>
                <th className="pb-1 text-right font-medium">Meta</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr><td className="py-0.5">Energia</td><td className="text-right">1.840 kcal</td><td className="text-right text-muted-foreground">1.850</td></tr>
              <tr><td className="py-0.5">Proteínas</td><td className="text-right">109,3 g</td><td className="text-right text-muted-foreground">110</td></tr>
              <tr><td className="py-0.5">Carboidratos</td><td className="text-right">182,1 g</td><td className="text-right text-muted-foreground">185</td></tr>
              <tr><td className="py-0.5">Fibras</td><td className="text-right">29,4 g</td><td className="text-right text-muted-foreground">25</td></tr>
            </tbody>
          </table>
          <div className="relative size-24 rounded-full" style={{ background: ring }}>
            <div className="absolute inset-3 grid place-items-center rounded-full bg-card text-center">
              <span className="text-[10px] leading-tight text-muted-foreground">
                <span className="block text-sm font-semibold text-foreground">99%</span>da meta
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -top-6 w-60 rounded-2xl bg-primary p-4 text-primary-foreground shadow-2xl sm:-right-8">
        <p className="text-sm font-semibold">Plano publicado!</p>
        <p className="mt-1 text-xs opacity-90">Seu paciente já pode ver o plano, as receitas e as recomendações no celular.</p>
      </div>
    </div>
  );
}

const showcaseItems: Array<{ title: string; text: string; soon?: string }> = [
  {
    title: 'Prescrição do seu jeito',
    text: 'Por alimentos, com substituições por equivalência, ou no modo qualitativo, sem números, para a nutrição comportamental.',
  },
  {
    title: 'Cálculo em tempo real',
    text: 'Energia, macros e micronutrientes contra as metas do paciente enquanto você monta cada refeição.',
  },
  {
    title: 'WhatsApp e agenda do Google',
    text: 'Lembretes de consulta e retorno pelo WhatsApp e agenda sincronizada com o Google.',
    soon: 'Em breve',
  },
];

export function Showcase() {
  return (
    <section className="overflow-hidden border-y border-border/60 bg-muted/30 py-20 lg:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <Reveal>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Feito com nutricionistas, para nutricionistas
          </h2>
          <ul className="mt-8 space-y-6">
            {showcaseItems.map((it) => (
              <li key={it.title} className="flex gap-4">
                <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  ›
                </span>
                <div>
                  <h3 className="text-lg font-semibold">
                    {it.title}
                    {it.soon && <SoonBadge label={it.soon} />}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{it.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.12}>
          <PrescriptionMock />
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------
const aiCards = [
  { icon: Brain, title: 'Anamnese resumida', text: 'Os pontos principais da anamnese organizados antes da consulta.' },
  { icon: Lightbulb, title: 'Orientações sob medida', text: 'Rascunhos de orientações adaptadas a cada paciente, para você revisar.' },
  { icon: FlaskConical, title: 'Leitura de exames', text: 'Destaque dos valores fora da referência para apoiar a sua análise.' },
  { icon: Sparkles, title: 'Sugestão de cardápio', text: 'Propostas com alimentos da base, calculadas pelo sistema, nunca inventadas pela IA.' },
];

export function AiSection() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-28">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_15%_20%,color-mix(in_oklch,var(--peach)_22%,transparent)_0%,transparent_70%),radial-gradient(45%_55%_at_85%_80%,color-mix(in_oklch,var(--leaf)_25%,transparent)_0%,transparent_70%)]" />
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
            <Sparkles className="size-3.5" /> Assistente de IA · em breve
          </Badge>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">O que a IA vai fazer por você</h2>
          <p className="mt-4 text-muted-foreground">A IA sugere, você decide. Nada chega ao paciente sem a sua revisão.</p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {aiCards.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <article className="h-full rounded-2xl border border-border bg-card/90 p-6 text-center shadow-lg shadow-black/5 backdrop-blur">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--peach))] text-white">
                  <Icon className="size-6" aria-hidden="true" />
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

// ---------------------------------------------------------------------------
// Benefícios (nutricionista e paciente)
// ---------------------------------------------------------------------------
const forNutritionist: Array<{ text: string; soon?: boolean }> = [
  { text: 'Pacientes, prontuário, avaliações e planos no mesmo lugar' },
  { text: 'Plano alimentar pronto em minutos, com PDF da sua marca' },
  { text: 'Atendimento presencial, online ou híbrido' },
  { text: 'Menos faltas com lembretes automáticos', soon: true },
  { text: 'Página pública com agendamento online', soon: true },
  { text: 'Comece grátis com até 20 pacientes ativos' },
];

const forPatient: Array<{ text: string; soon?: boolean }> = [
  { text: 'Plano alimentar na palma da mão, com substituições' },
  { text: 'Receitas, recomendações e documentos do nutricionista' },
  { text: 'Lista de compras gerada a partir do plano', soon: true },
  { text: 'Diário alimentar e meta de hidratação', soon: true },
  { text: 'Lembretes de refeição e de água', soon: true },
  { text: 'Acompanhamento da evolução', soon: true },
];

function BenefitList({ items }: { items: Array<{ text: string; soon?: boolean }> }) {
  return (
    <ul className="mt-5 divide-y divide-border">
      {items.map((b) => (
        <li key={b.text} className="flex items-start gap-3 py-3 text-sm">
          <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {b.text}
            {b.soon && <SoonBadge />}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Benefits() {
  return (
    <section id="paciente" className="scroll-mt-20 bg-forest py-20 text-white lg:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-leaf">Benefícios</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Bom para você, melhor para o seu paciente</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <Reveal>
            <article className="rounded-2xl bg-white p-6 text-[#17241b] shadow-2xl">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <HeartHandshake className="size-5 text-[#2E7D32]" aria-hidden="true" /> Para o nutricionista
              </h3>
              <BenefitList items={forNutritionist} />
            </article>
          </Reveal>
          <Reveal delay={0.1} className="flex justify-center">
            <div className="relative">
              <div className="absolute -inset-10 rounded-full bg-leaf/25 blur-3xl" />
              <PhoneMock className="relative" />
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <article className="rounded-2xl bg-white p-6 text-[#17241b] shadow-2xl">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <MessageCircle className="size-5 text-[#2E7D32]" aria-hidden="true" /> Para o paciente
              </h3>
              <BenefitList items={forPatient} />
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Princípios
// ---------------------------------------------------------------------------
const principles = [
  { icon: HeartHandshake, title: 'O nutricionista no centro', text: 'A plataforma tira o trabalho repetitivo do caminho para sobrar tempo para o paciente.' },
  { icon: CalendarCheck, title: 'Cálculos transparentes', text: 'Fórmulas com referência, protocolo registrado em cada avaliação e números que você confere.' },
  { icon: ShieldCheck, title: 'Dados protegidos', text: 'Cada consultório enxerga só os próprios dados, com acesso por papel na equipe.' },
  { icon: HandCoins, title: 'Preço justo', text: 'Comece grátis e só pague quando o seu consultório crescer.' },
];

export function Principles() {
  return (
    <section aria-labelledby="principios" className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Como trabalhamos</p>
          <h2 id="principios" className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Tecnologia que amplia o seu cuidado, sem substituir o seu julgamento
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <article className="h-full rounded-2xl border border-border bg-card p-6">
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
