'use client';

import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Leaf, LemonSlice, SaladBowl, Strawberry } from '@/components/art/ingredients';
import { MealPlanCard, PhoneMock, ProgressCard } from '@/components/art/product-cards';

/** Composição do hero com leve parallax de rolagem. */
export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const slow = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const mid = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const fast = useTransform(scrollYProgress, [0, 1], [0, -150]);
  const s = (v: typeof slow) => (reduced ? undefined : { y: v });

  return (
    <div ref={ref} aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[34rem]">
      <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--leaf)_0%,var(--primary)_55%,var(--forest)_100%)] opacity-90" />
      <div className="bg-grain absolute inset-[6%] rounded-full opacity-30 mix-blend-overlay" />
      <motion.div style={s(slow)} className="absolute inset-[16%]">
        <SaladBowl className="w-full drop-shadow-2xl" />
      </motion.div>
      <motion.div style={s(fast)} className="absolute -left-3 top-[44%]">
        <Leaf className="w-16 -rotate-12" />
      </motion.div>
      <motion.div style={s(mid)} className="absolute right-[6%] top-[3%]">
        <LemonSlice className="w-16" />
      </motion.div>
      <motion.div style={s(fast)} className="absolute bottom-[1%] left-[44%]">
        <Strawberry className="w-12 rotate-12" />
      </motion.div>
      <motion.div style={s(mid)} className="absolute -left-4 top-[4%] hidden scale-90 sm:block">
        <ProgressCard />
      </motion.div>
      <motion.div style={s(fast)} className="absolute -left-4 bottom-[4%] scale-90 sm:scale-100">
        <MealPlanCard />
      </motion.div>
      <motion.div style={s(slow)} className="absolute -right-3 bottom-[1%] hidden origin-bottom-right scale-[.8] md:block">
        <PhoneMock />
      </motion.div>
    </div>
  );
}
