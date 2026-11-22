'use client';

import { Activity, Baby, BarChart3, Check, Smartphone, Sparkles, Stethoscope, Users, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { GoogleButton, OrDivider } from '@/components/auth/google-button';
import { LoginForm } from '@/components/auth/login-form';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

type Role = 'nutri' | 'paciente';

const CARD = 'rn-card flex flex-col gap-3 rounded-[18px] border border-[#22603a] bg-[#174a28] p-[18px] hover:border-[#2f7d4b]';
const ICON = 'grid size-9 shrink-0 place-items-center rounded-[10px] [&>svg]:size-[18px]';

/** Respeita "reduzir movimento" do sistema (sem animação: valores finais na hora). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Número que conta de 0 até `to` (easeOutCubic). Recomeça quando `to` ou `key` mudam. */
function useCountUp(to: number, { duration = 1400, delay = 0, decimals = 0, key = 0 }: { duration?: number; delay?: number; decimals?: number; key?: number } = {}): number {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = reduced ? 1 : Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Number((to * eased).toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, reduced ? 0 : delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [to, duration, delay, decimals, key, reduced]);
  return v;
}

const fmt = (n: number, decimals = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const rise = (ms: number): CSSProperties => ({ '--d': `${ms}ms` }) as CSSProperties;

/** Cartão com brilho que segue o mouse e leve inclinação 3D (só com mouse; nada no toque). */
function TiltCard({ className, style, children }: { className: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const move = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const el = ref.current.style;
    el.setProperty('--mx', `${x * 100}%`);
    el.setProperty('--my', `${y * 100}%`);
    el.setProperty('--rx', `${(0.5 - y) * 5}deg`);
    el.setProperty('--ry', `${(x - 0.5) * 6}deg`);
    el.setProperty('--glow', '1');
  };
  const leave = () => {
    const el = ref.current?.style;
    if (!el) return;
    el.setProperty('--rx', '0deg');
    el.setProperty('--ry', '0deg');
    el.setProperty('--glow', '0');
  };
  return <article ref={ref} className={className} style={style} onPointerMove={move} onPointerLeave={leave}>{children}</article>;
}

/** Plano alimentar "vivo": kcal contando, barras crescendo e troca de plano a cada poucos segundos. */
const PLANS = [
  { label: 'Plano alimentar', kcal: 1850, p: 128, c: 210, g: 55 },
  { label: 'Hipertrofia', kcal: 2650, p: 175, c: 320, g: 74 },
  { label: 'Gestação · 2º trimestre', kcal: 2140, p: 96, c: 285, g: 70 },
  { label: 'Emagrecimento', kcal: 1520, p: 120, c: 150, g: 48 },
];
function PlanCard() {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [grow, setGrow] = useState(false);
  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => setGrow(true), 0);
      return () => clearTimeout(t);
    }
    const t0 = setTimeout(() => setGrow(false), 0);
    const t1 = setTimeout(() => setGrow(true), i === 0 ? 650 : 120);
    const t2 = setTimeout(() => setI((x) => (x + 1) % PLANS.length), 7000);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  }, [i, reduced]);
  const plan = PLANS[i]!;
  const delay = i === 0 ? 600 : 100;
  const kcal = useCountUp(plan.kcal, { duration: 1500, delay, key: i });
  const p = useCountUp(plan.p, { duration: 1300, delay: delay + 150, key: i });
  const c = useCountUp(plan.c, { duration: 1300, delay: delay + 300, key: i });
  const g = useCountUp(plan.g, { duration: 1300, delay: delay + 450, key: i });
  // Percentual da energia de cada macro (4, 4 e 9 kcal/g)
  const e = plan.p * 4 + plan.c * 4 + plan.g * 9;
  const pct = [(plan.p * 4) / e, (plan.c * 4) / e, (plan.g * 9) / e].map((x) => x * 100);
  const bar = (w: number, color: string, d: number) => (
    <div className="h-full transition-[width] ease-out" style={{ width: grow ? `${w}%` : '0%', background: color, transitionDuration: reduced ? '0ms' : '900ms', transitionDelay: reduced ? '0ms' : `${d}ms` }} />
  );
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] bg-[#f6f8f2] p-3.5 text-[#17241b]">
      <div className="flex items-center justify-between">
        <span key={plan.label} className="rn-rise text-[11px] font-bold tracking-[.06em] text-[#4b5d52] uppercase" style={rise(0)}>{plan.label}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e0f0dc] px-2 py-0.5 text-[11px] font-bold text-[#1f6a26]">
          <span className="rn-live-dot size-1.5 rounded-full bg-[#1f6a26]" aria-hidden="true" /> Publicado
        </span>
      </div>
      <p className="font-display text-[28px] leading-none font-semibold tabular-nums" aria-label={`${fmt(plan.kcal)} kcal`}>
        {fmt(kcal)} <span className="font-sans text-sm font-medium text-[#4b5d52]">kcal</span>
      </p>
      <div className="flex h-2 overflow-hidden rounded-full bg-[#e6ebe2]" aria-hidden="true">
        {bar(pct[0]!, '#3f9a45', 0)}
        {bar(pct[1]!, '#e8893a', 250)}
        {bar(pct[2]!, '#e3b51f', 500)}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-[#4b5d52]">
        <span>Proteína <strong className="block text-[13px] text-[#17241b] tabular-nums">{fmt(p)} g</strong></span>
        <span>Carboidrato <strong className="block text-[13px] text-[#17241b] tabular-nums">{fmt(c)} g</strong></span>
        <span>Gorduras <strong className="block text-[13px] text-[#17241b] tabular-nums">{fmt(g)} g</strong></span>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {PLANS.map((_, k) => <span key={k} className={cn('h-1 rounded-full transition-all duration-500', k === i ? 'w-5 bg-[#3f9a45]' : 'w-1.5 bg-[#cfd8cb]')} />)}
      </div>
    </div>
  );
}

/** Sugestões da IA digitadas com cursor, em rodízio. */
const SUGGESTIONS: Array<[string, string]> = [
  ['Substituição sugerida:', '4 col. de arroz ↔ 2 escumadeiras de macarrão'],
  ['Ajuste de proteína:', '+1 ovo no café da manhã para chegar a 1,6 g/kg'],
  ['Alerta de alergênico:', 'troque o leite por bebida de aveia no lanche'],
  ['Hidratação:', 'meta de 2,8 L por dia nos dias de treino'],
];
function AiTyping() {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [head, text] = SUGGESTIONS[i]!;
  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => setN(text.length), 0);
      return () => clearTimeout(t);
    }
    if (n < text.length) {
      const t = setTimeout(() => setN((x) => x + 1), i === 0 && n === 0 ? 1600 : 32);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setI((x) => (x + 1) % SUGGESTIONS.length); setN(0); }, 3200);
    return () => clearTimeout(t);
  }, [n, i, text.length, reduced]);
  return (
    <div className="min-h-[58px] rounded-[12px] border border-[#e3e9df] bg-white px-3.5 py-3 text-[13px] leading-[1.45]">
      <strong>{head}</strong> {text.slice(0, n)}
      {!reduced && <span className="rn-caret text-[#2f7a3d]" aria-hidden="true" />}
    </div>
  );
}

/** Evolução do paciente: −4,2 kg contando e a linha do gráfico se desenhando. */
function WeightEvolution() {
  const kg = useCountUp(4.2, { duration: 1800, delay: 1100, decimals: 1 });
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[22px] font-bold tabular-nums" aria-label="menos 4,2 kg">−{fmt(kg, 1)} kg</p>
        <p className="text-xs text-[#4b5d52]">em 8 semanas</p>
      </div>
      <svg viewBox="0 0 184 60" aria-hidden="true" className="h-12 w-3/5 overflow-visible">
        <defs>
          <linearGradient id="rn-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2E7D32" stopOpacity=".18" /><stop offset="100%" stopColor="#2E7D32" stopOpacity="0" /></linearGradient>
        </defs>
        <path d="M0 12 L26 16 L52 14 L78 24 L104 30 L130 34 L156 42 L182 50 L182 60 L0 60 Z" fill="url(#rn-area)" className="rn-rise" style={rise(1700)} />
        <path d="M0 12 L26 16 L52 14 L78 24 L104 30 L130 34 L156 42 L182 50" fill="none" stroke="#2E7D32" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="rn-draw" style={{ '--len': 200, '--d': '1100ms' } as CSSProperties} />
        <circle cx="182" cy="50" r="4.5" fill="#2E7D32" className="rn-pulse-ring" style={{ animationDelay: '2.8s' }} />
        <circle cx="182" cy="50" r="4.5" fill="#2E7D32" stroke="#ffffff" strokeWidth="2" className="rn-rise" style={rise(2600)} />
      </svg>
    </div>
  );
}

/** Módulos da gestão acendendo em sequência. */
const CHIPS = ['Agenda', 'Pacientes', 'Financeiro', 'Indicadores'];
function CyclingChips() {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(-1);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setOn((x) => (x + 1) % CHIPS.length), 1500);
    return () => clearInterval(t);
  }, [reduced]);
  return (
    <div className="flex flex-wrap gap-2">
      {CHIPS.map((t, k) => (
        <span key={t} className={cn('rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-all duration-500',
          k === on ? 'scale-105 border-[#6cc56f] bg-[#6cc56f] text-[#0b1f10]' : 'border-[#22603a] bg-[#0f3a1e] text-[#e4f1e6]')}>{t}</span>
      ))}
    </div>
  );
}

/** Folhas e grãos flutuando no fundo verde. */
const PARTICLES = [
  { x: '8%', y: '22%', s: 28, r: -20, t: 11, d: 0, dx: 14, c: '#6cc56f' },
  { x: '46%', y: '9%', s: 20, r: 30, t: 9, d: 1.5, dx: -10, c: '#a6e6a8' },
  { x: '88%', y: '38%', s: 24, r: 10, t: 12, d: 0.8, dx: -16, c: '#f2c94c' },
  { x: '30%', y: '62%', s: 18, r: -40, t: 10, d: 2.2, dx: 12, c: '#f2a65a' },
  { x: '70%', y: '78%', s: 26, r: 60, t: 13, d: 0.4, dx: -12, c: '#6cc56f' },
  { x: '15%', y: '88%', s: 20, r: 15, t: 9.5, d: 3, dx: 10, c: '#a6e6a8' },
  { x: '94%', y: '92%', s: 18, r: -10, t: 11.5, d: 1.2, dx: -8, c: '#f6b3c0' },
];
function Particles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {PARTICLES.map((p, k) => (
        <svg key={k} viewBox="0 0 24 24" className="rn-float absolute opacity-40" width={p.s} height={p.s}
          style={{ left: p.x, top: p.y, '--r': `${p.r}deg`, '--t': `${p.t}s`, '--d': `${p.d}s`, '--dx': `${p.dx}px` } as CSSProperties}>
          {k % 3 === 0
            ? <path d="M20 4C11 4 5 9 5 16c0 2 .5 3.5 1.5 4.5C7.5 15 11 11 16 9c-4 3-6.5 6.5-7.5 11.5 1.5.5 2.5.5 4 .5 7 0 10.5-6.5 7.5-17z" fill={p.c} />
            : k % 3 === 1 ? <circle cx="12" cy="12" r="7" fill={p.c} /> : <ellipse cx="12" cy="12" rx="9" ry="5" fill={p.c} transform="rotate(30 12 12)" />}
        </svg>
      ))}
    </div>
  );
}

/** Vitrine das áreas atendidas (lado direito da tela de login). Mesmas cores nos dois temas. */
function Showcase() {
  return (
    <section aria-label="Áreas atendidas pela Rafanutri" className="relative flex min-w-0 flex-[999_1_560px] flex-col gap-7 overflow-hidden bg-[#0f3a1e] px-5 py-8 sm:px-14 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 -left-40 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(108,197,111,.22),transparent_60%)]" />
      <Particles />
      <svg viewBox="0 0 100 100" aria-hidden="true" className="rn-spin-slow absolute -top-7 -right-7 size-40 opacity-90">
        <circle cx="50" cy="50" r="48" fill="#F2C94C" />
        <circle cx="50" cy="50" r="42" fill="#FFF3B0" />
        {[0, 90, 180, 270].map((r) => (
          <path key={r} d="M50 50 L50 13 A37 37 0 0 1 76.2 23.8 Z" fill="#FBE27A" stroke="#FFF8D6" strokeWidth="3" transform={`rotate(${r} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="5" fill="#FFF8D6" />
      </svg>

      <div className="relative flex max-w-[620px] flex-col gap-3">
        <p className="rn-rise text-[13px] font-bold tracking-[.08em] text-[#a6e6a8] uppercase" style={rise(80)}>Uma plataforma, toda a nutrição</p>
        <h2 className="rn-rise font-display text-[34px] leading-[1.08] font-semibold text-white sm:text-[42px]" style={rise(160)}>Nutrição de precisão, do consultório ao prato.</h2>
        <p className="rn-rise text-base leading-[1.55] text-[#cfe3d2]" style={rise(240)}>Atendimento clínico e esportivo, materno-infantil, saúde pública, UAN e a gestão do seu negócio — com assistentes de IA e um app para o paciente.</p>
      </div>

      <div className="relative grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TiltCard className={cn(CARD, 'rn-rise col-span-2 gap-3.5')} style={rise(320)}>
          <div className="flex items-center gap-2.5">
            <span className={cn(ICON, 'bg-[#6cc56f] text-[#0b1f10]')}><Stethoscope aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold text-white">Nutrição clínica</h3>
              <p className="text-[13px] text-[#cfe3d2]">Consultas, avaliação e planos alimentares</p>
            </div>
          </div>
          <PlanCard />
        </TiltCard>

        <TiltCard className={cn(CARD, 'rn-rise')} style={rise(400)}>
          <span className={cn(ICON, 'bg-[#f2a65a] text-[#2a1606]')}><Activity aria-hidden="true" /></span>
          <h3 className="text-base font-bold text-white">Esportiva</h3>
          <p className="text-[13px] leading-[1.45] text-[#cfe3d2]">Composição corporal e estratégia para treino e competição.</p>
        </TiltCard>

        <TiltCard className={cn(CARD, 'rn-rise')} style={rise(480)}>
          <span className={cn(ICON, 'bg-[#f6b3c0] text-[#3a0d17]')}><Baby aria-hidden="true" /></span>
          <h3 className="text-base font-bold text-white">Materno-infantil</h3>
          <p className="text-[13px] leading-[1.45] text-[#cfe3d2]">Gestação, amamentação e infância.</p>
        </TiltCard>

        <TiltCard className={cn(CARD, 'rn-rise')} style={rise(560)}>
          <span className={cn(ICON, 'bg-[#9fc2f5] text-[#0b1f3a]')}><Users aria-hidden="true" /></span>
          <h3 className="text-base font-bold text-white">Saúde pública</h3>
          <p className="text-[13px] leading-[1.45] text-[#cfe3d2]">Ações coletivas e acompanhamento de grupos.</p>
        </TiltCard>

        <TiltCard className={cn(CARD, 'rn-rise')} style={rise(640)}>
          <span className={cn(ICON, 'bg-[#f2c94c] text-[#2b2104]')}><UtensilsCrossed aria-hidden="true" /></span>
          <h3 className="text-base font-bold text-white">UAN</h3>
          <p className="text-[13px] leading-[1.45] text-[#cfe3d2]">Unidades de alimentação com gestão de qualidade.</p>
        </TiltCard>

        <TiltCard className={cn(CARD, 'rn-rise col-span-2')} style={rise(720)}>
          <div className="flex items-center gap-2.5">
            <span className={cn(ICON, 'bg-[#c9b8f2] text-[#1d0f3a]')}><BarChart3 aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold text-white">Gestão do negócio</h3>
              <p className="text-[13px] text-[#cfe3d2]">O consultório organizado de ponta a ponta</p>
            </div>
          </div>
          <CyclingChips />
        </TiltCard>

        <TiltCard className="rn-card rn-rise col-span-2 flex flex-col gap-3 rounded-[18px] bg-[#f6f8f2] p-[18px] text-[#17241b]" style={rise(800)}>
          <div className="flex items-center gap-2.5">
            <span className={cn(ICON, 'bg-[#17241b] text-[#f2c94c]')}><Sparkles className="rn-twinkle" aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold">Assistentes de IA</h3>
              <p className="text-[13px] text-[#4b5d52]">Sugestões que aceleram a prescrição</p>
            </div>
          </div>
          <AiTyping />
        </TiltCard>

        <TiltCard className="rn-card rn-rise col-span-2 flex flex-col gap-2.5 rounded-[18px] bg-[#f6f8f2] p-[18px] text-[#17241b]" style={rise(880)}>
          <div className="flex items-center gap-2.5">
            <span className={cn(ICON, 'bg-[#17241b] text-[#6cc56f]')}><Smartphone aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold">App do paciente</h3>
              <p className="text-[13px] text-[#4b5d52]">Plano alimentar e evolução no celular</p>
            </div>
          </div>
          <WeightEvolution />
        </TiltCard>
      </div>

      <div className="rn-rise rn-shine relative inline-flex items-center gap-3 self-start rounded-[16px] border border-[#22603a] bg-[#0a2814] py-2.5 pr-4 pl-2.5" style={rise(960)}>
        <span className={cn(ICON, 'bg-[#f2a65a] text-[#17241b]')}><Check aria-hidden="true" /></span>
        <div>
          <p className="text-sm font-bold text-white">Até 20 pacientes grátis</p>
          <p className="text-xs text-[#cfe3d2]">Sem cartão, para sempre</p>
        </div>
      </div>
    </section>
  );
}

/** Tela de login: formulário à esquerda (nutricionista ou paciente) e vitrine das áreas à direita. */
export function LoginScreen({ next, google = false, googleError = null }: { next?: string; google?: boolean; googleError?: string | null }) {
  const [role, setRole] = useState<Role>('nutri');
  const nutri = role === 'nutri';
  const tab = (active: boolean) =>
    cn('relative z-10 inline-flex h-11 items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7fd483] [&>svg]:size-4',
      active ? 'text-[#0b1f10]' : 'text-[#4b5d52] hover:text-[#17241b] dark:text-[#b7c7bb] dark:hover:text-[#eef3ee]');
  const card = 'rn-rise flex flex-col gap-1.5 rounded-[14px] border border-[#e3e9df] bg-[#f6f8f2] px-[18px] py-4 dark:border-[#1f2b23] dark:bg-[#0f1912]';

  return (
    <div className="flex min-h-dvh flex-wrap bg-[#f7f8f3] font-sans text-[#17241b] dark:bg-[#0a110c] dark:text-[#eef3ee]">
      <main className="flex min-w-0 flex-[1_1_440px] flex-col gap-6 px-5 py-5 sm:px-12 sm:py-8">
        <header className="rn-rise flex items-center justify-between" style={rise(0)}>
          <Logo />
          <ThemeToggle className="size-11 rounded-[12px] border border-[#d9e1d6] dark:border-[#1f2b23]" />
        </header>

        <div className="flex flex-1 items-center justify-center py-6">
          <div className="flex w-full max-w-[400px] flex-col gap-7">
            <div className="rn-rise flex flex-col gap-2.5" style={rise(80)}>
              <h1 className="font-display text-4xl leading-[1.1] font-semibold tracking-[-0.01em]">Entrar na Rafanutri</h1>
              <p key={role} className="rn-rise text-[15px] leading-[1.5] text-[#5b6a60] dark:text-[#9fb2a4]" style={rise(0)}>
                {nutri ? 'Acesse seus pacientes, planos alimentares, agenda e a gestão do consultório.' : 'Veja seu plano alimentar e acompanhe sua evolução.'}
              </p>
            </div>

            <div role="group" aria-label="Tipo de acesso" className="rn-rise relative grid grid-cols-2 gap-1 rounded-[14px] border border-[#d9e1d6] bg-[#eef2ea] p-1 dark:border-[#1f2b23] dark:bg-[#121c15]" style={rise(160)}>
              {/* pílula que desliza até a aba escolhida */}
              <span aria-hidden="true" className="absolute top-1 bottom-1 left-1 w-[calc(50%-6px)] rounded-[10px] bg-[#6cc56f] shadow-[0_6px_18px_-8px_rgba(108,197,111,.9)] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
                style={{ transform: nutri ? 'translateX(0)' : 'translateX(calc(100% + 4px))' }} />
              <button type="button" aria-pressed={nutri} onClick={() => setRole('nutri')} className={tab(nutri)}><Stethoscope aria-hidden="true" /> Sou nutricionista</button>
              <button type="button" aria-pressed={!nutri} onClick={() => setRole('paciente')} className={tab(!nutri)}><Smartphone aria-hidden="true" /> Sou paciente</button>
            </div>

            <div className="rn-rise flex flex-col gap-4" style={rise(240)}>
              {googleError && <p role="alert" className="rounded-[12px] border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">{googleError}</p>}
              {google && <><GoogleButton next={next} /><OrDivider /></>}
              <LoginForm next={next} emailPlaceholder={nutri ? 'voce@consultorio.com.br' : 'seu@email.com'} />
            </div>

            {nutri ? (
              <div key="nutri" className={card} style={rise(320)}>
                <p className="text-sm text-[#4b5d52] dark:text-[#b7c7bb]">Ainda não tem conta? <Link href="/cadastro" className="font-bold text-[#2f7a3d] hover:text-[#1f5a2a] dark:text-[#7fd483] dark:hover:text-[#a6e6a8]">Criar conta grátis</Link></p>
                <p className="text-[13px] text-[#6b7c70] dark:text-[#8ea293]">Até 20 pacientes, sem cartão, para sempre.</p>
              </div>
            ) : (
              <div key="paciente" className={card} style={rise(0)}>
                <p className="text-sm text-[#4b5d52] dark:text-[#b7c7bb]">Primeiro acesso? Use o convite que seu nutricionista enviou.</p>
                <p className="text-[13px] text-[#6b7c70] dark:text-[#8ea293]">Depois de entrar, você vê o plano alimentar e a evolução no celular.</p>
              </div>
            )}
          </div>
        </div>

        <footer className="rn-rise flex flex-wrap justify-center gap-4 text-[13px] text-[#6b7c70] dark:text-[#8ea293]" style={rise(400)}>
          <Link href="/termos" className="hover:underline">Termos</Link>
          <Link href="/privacidade" className="hover:underline">Privacidade</Link>
          <span>© {new Date().getFullYear()} Rafanutri</span>
        </footer>
      </main>
      <Showcase />
    </div>
  );
}
