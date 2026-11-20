'use client';

import { Activity, Baby, BarChart3, Check, Smartphone, Sparkles, Stethoscope, Users, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

type Role = 'nutri' | 'paciente';

const CARD = 'flex flex-col gap-3 rounded-[18px] border border-[#22603a] bg-[#174a28] p-[18px]';
const ICON = 'grid size-9 shrink-0 place-items-center rounded-[10px] [&>svg]:size-[18px]';

/** Vitrine das áreas atendidas (lado direito da tela de login). Mesmas cores nos dois temas. */
function Showcase() {
  return (
    <section aria-label="Áreas atendidas pela Rafanutri" className="relative flex min-w-0 flex-[999_1_560px] flex-col gap-7 overflow-hidden bg-[#0f3a1e] px-5 py-8 sm:px-14 sm:py-12">
      <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute -top-7 -right-7 size-40 opacity-90">
        <circle cx="50" cy="50" r="48" fill="#F2C94C" />
        <circle cx="50" cy="50" r="42" fill="#FFF3B0" />
        {[0, 90, 180, 270].map((r) => (
          <path key={r} d="M50 50 L50 13 A37 37 0 0 1 76.2 23.8 Z" fill="#FBE27A" stroke="#FFF8D6" strokeWidth="3" transform={`rotate(${r} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="5" fill="#FFF8D6" />
      </svg>

      <div className="relative flex max-w-[620px] flex-col gap-3">
        <p className="text-[13px] font-bold tracking-[.08em] text-[#a6e6a8] uppercase">Uma plataforma, toda a nutrição</p>
        <h2 className="font-display text-[34px] leading-[1.08] font-semibold text-white sm:text-[42px]">Nutrição de precisão, do consultório ao prato.</h2>
        <p className="text-base leading-[1.55] text-[#cfe3d2]">Atendimento clínico e esportivo, materno-infantil, saúde pública, UAN e a gestão do seu negócio — com assistentes de IA e um app para o paciente.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <article className={cn(CARD, 'col-span-2 gap-3.5')}>
          <div className="flex items-center gap-2.5">
            <span className={cn(ICON, 'bg-[#6cc56f] text-[#0b1f10]')}><Stethoscope aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold text-white">Nutrição clínica</h3>
              <p className="text-[13px] text-[#cfe3d2]">Consultas, avaliação e planos alimentares</p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 rounded-[14px] bg-[#f6f8f2] p-3.5 text-[#17241b]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[.06em] text-[#4b5d52] uppercase">Plano alimentar</span>
              <span className="rounded-full bg-[#e0f0dc] px-2 py-0.5 text-[11px] font-bold text-[#1f6a26]">Publicado</span>
            </div>
            <p className="font-display text-[28px] leading-none font-semibold">1.850 <span className="font-sans text-sm font-medium text-[#4b5d52]">kcal</span></p>
            <div className="flex h-2 overflow-hidden rounded-full bg-[#e6ebe2]" aria-hidden="true">
              <div className="w-[28%] bg-[#3f9a45]" />
              <div className="w-[45%] bg-[#e8893a]" />
              <div className="w-[27%] bg-[#e3b51f]" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-[#4b5d52]">
              <span>Proteína <strong className="block text-[13px] text-[#17241b]">128 g</strong></span>
              <span>Carboidrato <strong className="block text-[13px] text-[#17241b]">210 g</strong></span>
              <span>Gorduras <strong className="block text-[13px] text-[#17241b]">55 g</strong></span>
            </div>
          </div>
        </article>

        <article className={CARD}>
          <span className={cn(ICON, 'bg-[#f2a65a] text-[#2a1606]')}><Activity aria-hidden="true" /></span>
          <h3 className="text-base font-bold text-white">Esportiva</h3>
          <p className="text-[13px] leading-[1.45] text-[#cfe3d2]">Composição corporal e estratégia para treino e competição.</p>
        </article>

        <article className={CARD}>
          <span className={cn(ICON, 'bg-[#f6b3c0] text-[#3a0d17]')}><Baby aria-hidden="true" /></span>
          <h3 className="text-base font-bold text-white">Materno-infantil</h3>
          <p className="text-[13px] leading-[1.45] text-[#cfe3d2]">Gestação, amamentação e infância.</p>
        </article>

        <article className={CARD}>
          <span className={cn(ICON, 'bg-[#9fc2f5] text-[#0b1f3a]')}><Users aria-hidden="true" /></span>
          <h3 className="text-base font-bold text-white">Saúde pública</h3>
          <p className="text-[13px] leading-[1.45] text-[#cfe3d2]">Ações coletivas e acompanhamento de grupos.</p>
        </article>

        <article className={CARD}>
          <span className={cn(ICON, 'bg-[#f2c94c] text-[#2b2104]')}><UtensilsCrossed aria-hidden="true" /></span>
          <h3 className="text-base font-bold text-white">UAN</h3>
          <p className="text-[13px] leading-[1.45] text-[#cfe3d2]">Unidades de alimentação com gestão de qualidade.</p>
        </article>

        <article className={cn(CARD, 'col-span-2')}>
          <div className="flex items-center gap-2.5">
            <span className={cn(ICON, 'bg-[#c9b8f2] text-[#1d0f3a]')}><BarChart3 aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold text-white">Gestão do negócio</h3>
              <p className="text-[13px] text-[#cfe3d2]">O consultório organizado de ponta a ponta</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Agenda', 'Pacientes', 'Financeiro', 'Indicadores'].map((t) => (
              <span key={t} className="rounded-full border border-[#22603a] bg-[#0f3a1e] px-3 py-1.5 text-[13px] font-semibold text-[#e4f1e6]">{t}</span>
            ))}
          </div>
        </article>

        <article className="col-span-2 flex flex-col gap-3 rounded-[18px] bg-[#f6f8f2] p-[18px] text-[#17241b]">
          <div className="flex items-center gap-2.5">
            <span className={cn(ICON, 'bg-[#17241b] text-[#f2c94c]')}><Sparkles aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold">Assistentes de IA</h3>
              <p className="text-[13px] text-[#4b5d52]">Sugestões que aceleram a prescrição</p>
            </div>
          </div>
          <div className="rounded-[12px] border border-[#e3e9df] bg-white px-3.5 py-3 text-[13px] leading-[1.45]">
            <strong>Substituição sugerida:</strong> 4 col. de arroz ↔ 2 escumadeiras de macarrão
          </div>
        </article>

        <article className="col-span-2 flex flex-col gap-2.5 rounded-[18px] bg-[#f6f8f2] p-[18px] text-[#17241b]">
          <div className="flex items-center gap-2.5">
            <span className={cn(ICON, 'bg-[#17241b] text-[#6cc56f]')}><Smartphone aria-hidden="true" /></span>
            <div>
              <h3 className="text-base font-bold">App do paciente</h3>
              <p className="text-[13px] text-[#4b5d52]">Plano alimentar e evolução no celular</p>
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[22px] font-bold">−4,2 kg</p>
              <p className="text-xs text-[#4b5d52]">em 8 semanas</p>
            </div>
            <svg viewBox="0 0 184 60" aria-hidden="true" className="h-12 w-3/5">
              <path d="M0 12 L26 16 L52 14 L78 24 L104 30 L130 34 L156 42 L182 50" fill="none" stroke="#2E7D32" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="182" cy="50" r="4.5" fill="#2E7D32" stroke="#ffffff" strokeWidth="2" />
            </svg>
          </div>
        </article>
      </div>

      <div className="inline-flex items-center gap-3 self-start rounded-[16px] border border-[#22603a] bg-[#0a2814] py-2.5 pr-4 pl-2.5">
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
export function LoginScreen({ next }: { next?: string }) {
  const [role, setRole] = useState<Role>('nutri');
  const nutri = role === 'nutri';
  const tab = (active: boolean) =>
    cn('inline-flex h-11 items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7fd483] [&>svg]:size-4',
      active ? 'bg-[#6cc56f] text-[#0b1f10]' : 'text-[#4b5d52] hover:text-[#17241b] dark:text-[#b7c7bb] dark:hover:text-[#eef3ee]');
  const card = 'flex flex-col gap-1.5 rounded-[14px] border border-[#e3e9df] bg-[#f6f8f2] px-[18px] py-4 dark:border-[#1f2b23] dark:bg-[#0f1912]';

  return (
    <div className="flex min-h-dvh flex-wrap bg-[#f7f8f3] font-sans text-[#17241b] dark:bg-[#0a110c] dark:text-[#eef3ee]">
      <main className="flex min-w-0 flex-[1_1_440px] flex-col gap-6 px-5 py-5 sm:px-12 sm:py-8">
        <header className="flex items-center justify-between">
          <Logo />
          <ThemeToggle className="size-11 rounded-[12px] border border-[#d9e1d6] dark:border-[#1f2b23]" />
        </header>

        <div className="flex flex-1 items-center justify-center py-6">
          <div className="flex w-full max-w-[400px] flex-col gap-7">
            <div className="flex flex-col gap-2.5">
              <h1 className="font-display text-4xl leading-[1.1] font-semibold tracking-[-0.01em]">Entrar na Rafanutri</h1>
              <p className="text-[15px] leading-[1.5] text-[#5b6a60] dark:text-[#9fb2a4]">
                {nutri ? 'Acesse seus pacientes, planos alimentares, agenda e a gestão do consultório.' : 'Veja seu plano alimentar e acompanhe sua evolução.'}
              </p>
            </div>

            <div role="group" aria-label="Tipo de acesso" className="grid grid-cols-2 gap-1 rounded-[14px] border border-[#d9e1d6] bg-[#eef2ea] p-1 dark:border-[#1f2b23] dark:bg-[#121c15]">
              <button type="button" aria-pressed={nutri} onClick={() => setRole('nutri')} className={tab(nutri)}><Stethoscope aria-hidden="true" /> Sou nutricionista</button>
              <button type="button" aria-pressed={!nutri} onClick={() => setRole('paciente')} className={tab(!nutri)}><Smartphone aria-hidden="true" /> Sou paciente</button>
            </div>

            <LoginForm next={next} emailPlaceholder={nutri ? 'voce@consultorio.com.br' : 'seu@email.com'} />

            {nutri ? (
              <div className={card}>
                <p className="text-sm text-[#4b5d52] dark:text-[#b7c7bb]">Ainda não tem conta? <Link href="/cadastro" className="font-bold text-[#2f7a3d] hover:text-[#1f5a2a] dark:text-[#7fd483] dark:hover:text-[#a6e6a8]">Criar conta grátis</Link></p>
                <p className="text-[13px] text-[#6b7c70] dark:text-[#8ea293]">Até 20 pacientes, sem cartão, para sempre.</p>
              </div>
            ) : (
              <div className={card}>
                <p className="text-sm text-[#4b5d52] dark:text-[#b7c7bb]">Primeiro acesso? Use o convite que seu nutricionista enviou.</p>
                <p className="text-[13px] text-[#6b7c70] dark:text-[#8ea293]">Depois de entrar, você vê o plano alimentar e a evolução no celular.</p>
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap justify-center gap-4 text-[13px] text-[#6b7c70] dark:text-[#8ea293]">
          <Link href="/termos" className="hover:underline">Termos</Link>
          <Link href="/privacidade" className="hover:underline">Privacidade</Link>
          <span>© {new Date().getFullYear()} Rafanutri</span>
        </footer>
      </main>
      <Showcase />
    </div>
  );
}
