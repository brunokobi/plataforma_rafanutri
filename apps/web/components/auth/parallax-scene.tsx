'use client';

import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Almond, Avocado, Blueberries, LemonSlice, Leaf, SaladBowl, Strawberry } from '@/components/art/ingredients';
import { AiHintCard, FreePlanBadge, MealPlanCard, ProgressCard } from '@/components/art/product-cards';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { cn } from '@/lib/utils';

const SPRING = { stiffness: 70, damping: 18, mass: 0.6 };

/** Uma camada da cena: desloca-se proporcionalmente à profundidade. */
function Layer({
  depth,
  pointerX,
  pointerY,
  scrollY,
  float = 0,
  floatDuration = 7,
  reduced,
  className,
  children,
}: {
  depth: number;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  scrollY: MotionValue<number>;
  float?: number;
  floatDuration?: number;
  reduced: boolean;
  className?: string;
  children: ReactNode;
}) {
  const x = useSpring(useTransform(pointerX, (v) => v * depth), SPRING);
  const yPointer = useTransform(pointerY, (v) => v * depth);
  const yScroll = useTransform(scrollY, (v) => -v * depth * 0.012);
  const y = useSpring(useTransform(() => yPointer.get() + yScroll.get()), SPRING);

  return (
    <motion.div className={cn('pointer-events-none absolute', className)} style={reduced ? undefined : { x, y }}>
      <motion.div
        className="will-change-transform"
        animate={reduced || !float ? undefined : { y: [0, -float, 0], rotate: [0, float / 6, 0] }}
        transition={{ duration: floatDuration, repeat: Infinity, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/**
 * Cena decorativa da tela de login. Camadas em profundidade (gradiente, luzes, prato,
 * ingredientes, cards do produto e frase) reagem ao mouse no desktop e à rolagem no celular.
 */
export function ParallaxScene({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const { scrollY } = useScroll();

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      // -0,5 a 0,5 em relação ao centro da janela
      pointerX.set(e.clientX / window.innerWidth - 0.5);
      pointerY.set(e.clientY / window.innerHeight - 0.5);
    };
    const onLeave = () => {
      pointerX.set(0);
      pointerY.set(0);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [reduced, pointerX, pointerY]);

  const common = { pointerX, pointerY, scrollY, reduced };

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="parallax-scene"
      data-reduced-motion={reduced ? 'true' : 'false'}
      className={cn('relative isolate overflow-hidden bg-[#0f3d1f]', className)}
    >
      {/* 1. Gradiente da marca + grão */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,#3f9a45_0%,#1f5f2b_45%,#0c2e17_100%)]" />
      <div className="bg-grain absolute inset-0 opacity-25 mix-blend-overlay" />

      {/* 2. Luzes desfocadas */}
      <Layer depth={6} {...common} className="-left-24 top-10">
        <div className="size-80 rounded-full bg-[#9be37f] opacity-30 blur-3xl" />
      </Layer>
      <Layer depth={10} {...common} className="-right-16 bottom-0">
        <div className="size-96 rounded-full bg-[#F2A65A] opacity-25 blur-3xl" />
      </Layer>

      {/* 3. Prato */}
      <Layer depth={14} float={6} floatDuration={11} {...common} className="left-1/2 top-1/2 -ml-[13rem] -mt-[11rem] xl:-ml-[15rem]">
        <SaladBowl className="w-[26rem] drop-shadow-2xl xl:w-[30rem]" />
      </Layer>

      {/* 4. Ingredientes flutuando */}
      <Layer depth={26} float={10} floatDuration={6.5} {...common} className="left-[8%] top-[12%]">
        <Leaf className="w-28 -rotate-12" />
      </Layer>
      <Layer depth={32} float={12} floatDuration={8} {...common} className="right-[10%] top-[8%]">
        <LemonSlice className="w-24" />
      </Layer>
      <Layer depth={36} float={9} floatDuration={7.2} {...common} className="bottom-[14%] left-[12%]">
        <Strawberry className="w-20 rotate-12" />
      </Layer>
      <Layer depth={22} float={8} floatDuration={9} {...common} className="bottom-[10%] right-[18%]">
        <Avocado className="w-20 -rotate-[24deg]" />
      </Layer>
      <Layer depth={40} float={7} floatDuration={5.8} {...common} className="right-[6%] top-[46%]">
        <Almond className="w-10 rotate-[30deg]" />
      </Layer>
      <Layer depth={30} float={6} floatDuration={6.8} {...common} className="left-[4%] top-[52%]">
        <Blueberries className="w-16" />
      </Layer>

      {/* 5. Cards do produto */}
      <Layer depth={44} float={8} floatDuration={9.5} {...common} className="right-[7%] top-[18%] hidden lg:block">
        <MealPlanCard />
      </Layer>
      <Layer depth={52} float={10} floatDuration={8.4} {...common} className="bottom-[20%] left-[9%] hidden lg:block">
        <ProgressCard />
      </Layer>
      <Layer depth={48} float={6} floatDuration={7.6} {...common} className="bottom-[8%] right-[8%] hidden lg:block">
        <FreePlanBadge />
      </Layer>
      <Layer depth={38} float={5} floatDuration={10} {...common} className="left-[14%] top-[30%] hidden xl:block">
        <AiHintCard />
      </Layer>

      {/* 6. Frase de impacto */}
      <div className="absolute inset-x-0 top-0 hidden p-10 lg:block">
        <p className="max-w-md font-display text-3xl font-semibold leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.45)] xl:text-4xl">
          Nutrição de precisão, do consultório ao prato.
        </p>
      </div>
    </div>
  );
}
