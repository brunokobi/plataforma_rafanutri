// Cards ilustrativos do produto (números de demonstração, como em material de marketing).
import { Sparkles, TrendingDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const macros = [
  { label: 'Proteína', value: '128 g', pct: 28, color: 'bg-primary' },
  { label: 'Carboidrato', value: '210 g', pct: 45, color: 'bg-peach' },
  { label: 'Gorduras', value: '55 g', pct: 27, color: 'bg-lemon' },
];

export function MealPlanCard({ className }: { className?: string }) {
  return (
    <div className={cn('w-64 rounded-2xl border border-white/40 bg-white/90 p-4 text-[#17241b] shadow-2xl shadow-black/20 backdrop-blur-md', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[#4b5d52]">Plano alimentar</p>
        <span className="rounded-full bg-[#e6f3e3] px-2 py-0.5 text-[10px] font-semibold text-[#2E7D32]">Publicado</span>
      </div>
      <p className="mt-1 font-display text-3xl font-semibold">1.850 <span className="text-base font-medium text-[#4b5d52]">kcal</span></p>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#eef1ea]">
        {macros.map((m) => (
          <div key={m.label} className={m.color} style={{ width: `${m.pct}%` }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {macros.map((m) => (
          <li key={m.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className={cn('size-2 rounded-full', m.color)} />
              {m.label}
            </span>
            <span className="font-semibold tabular-nums">{m.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProgressCard({ className }: { className?: string }) {
  const points = [62, 58, 60, 52, 47, 44, 38, 30];
  const path = points.map((y, i) => `${i === 0 ? 'M' : 'L'}${i * 26} ${y}`).join(' ');
  return (
    <div className={cn('w-60 rounded-2xl border border-white/40 bg-white/90 p-4 text-[#17241b] shadow-2xl shadow-black/20 backdrop-blur-md', className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-[#4b5d52]">
        <TrendingDown className="size-4 text-[#2E7D32]" /> Evolução
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">−4,2 kg</p>
      <p className="text-xs text-[#4b5d52]">em 8 semanas</p>
      <svg viewBox="0 0 184 70" className="mt-2 h-14 w-full" aria-hidden="true">
        <defs>
          <linearGradient id="pg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2E7D32" stopOpacity=".3" />
            <stop offset="100%" stopColor="#2E7D32" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L182 70 L0 70 Z`} fill="url(#pg)" />
        <path d={path} fill="none" stroke="#2E7D32" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="182" cy="30" r="4.5" fill="#2E7D32" stroke="white" strokeWidth="2" />
      </svg>
    </div>
  );
}

export function FreePlanBadge({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl bg-[#17241b]/90 px-4 py-3 text-white shadow-2xl shadow-black/30 backdrop-blur-md', className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-[#F2A65A] text-[#17241b]">
        <Users className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold leading-tight">Até 20 pacientes grátis</p>
        <p className="text-xs text-white/70">Sem cartão, para sempre</p>
      </div>
    </div>
  );
}

export function AiHintCard({ className }: { className?: string }) {
  return (
    <div className={cn('flex w-56 items-start gap-2 rounded-2xl border border-white/40 bg-white/90 p-3 text-[#17241b] shadow-xl shadow-black/15 backdrop-blur-md', className)}>
      <Sparkles className="mt-0.5 size-4 shrink-0 text-[#d97706]" />
      <p className="text-xs leading-snug">
        <span className="font-semibold">Substituição sugerida:</span> 4 col. de arroz ↔ 2 escumadeiras de macarrão
      </p>
    </div>
  );
}

export function PhoneMock({ className }: { className?: string }) {
  const meals = [
    { time: '07:30', name: 'Café da manhã', items: 'Iogurte, aveia e morangos' },
    { time: '12:30', name: 'Almoço', items: 'Arroz, feijão, frango e salada' },
    { time: '16:00', name: 'Lanche', items: 'Banana e castanhas' },
  ];
  return (
    <div className={cn('w-56 rounded-[2.2rem] border-[6px] border-[#17241b] bg-[#f9f8f3] p-3 text-[#17241b] shadow-2xl shadow-black/30', className)}>
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-[#17241b]/80" />
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#4b5d52]">Hoje</p>
      <p className="font-display text-lg font-semibold">Olá, Marina 👋</p>
      <ul className="mt-3 space-y-2">
        {meals.map((m, i) => (
          <li key={m.time} className={cn('rounded-xl p-2.5', i === 1 ? 'bg-[#2E7D32] text-white' : 'bg-white')}>
            <p className={cn('text-[10px] font-semibold', i === 1 ? 'text-white/80' : 'text-[#2E7D32]')}>{m.time} · {m.name}</p>
            <p className="text-xs leading-snug">{m.items}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-xl bg-[#e6f3e3] p-2.5">
        <p className="text-[10px] font-semibold text-[#2E7D32]">Hidratação</p>
        <div className="mt-1 h-1.5 rounded-full bg-white">
          <div className="h-1.5 w-2/3 rounded-full bg-[#4F9DDE]" />
        </div>
      </div>
    </div>
  );
}
