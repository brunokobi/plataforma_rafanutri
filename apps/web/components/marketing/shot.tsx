import Image from 'next/image';
import type { Shot } from '@/lib/marketing/modules';
import { cn } from '@/lib/utils';

/** Captura real do produto numa moldura de celular ou de navegador. */
export function ShotFrame({ shot, priority = false, className }: { shot: Shot; priority?: boolean; className?: string }) {
  if (shot.kind === 'phone') {
    return (
      <figure className={cn('relative mx-auto w-[min(100%,300px)]', className)}>
        <div className="rounded-[2.6rem] bg-neutral-900 p-2.5 shadow-2xl shadow-primary/20 ring-1 ring-black/10 dark:bg-neutral-800">
          <div className="relative overflow-hidden rounded-[2.1rem] bg-background">
            <span aria-hidden="true" className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-neutral-900" />
            <Image src={shot.src} alt={shot.alt} width={780} height={1688} priority={priority} sizes="300px" className="h-auto w-full" />
          </div>
        </div>
      </figure>
    );
  }
  return (
    <figure className={cn('relative w-full', className)}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
        <div aria-hidden="true" className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-rose-400" /><span className="size-2.5 rounded-full bg-amber-400" /><span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 hidden flex-1 truncate rounded-md bg-background px-3 py-1 text-[11px] text-muted-foreground sm:block">Rafanutri · área do nutricionista</span>
        </div>
        <Image src={shot.src} alt={shot.alt} width={1440} height={900} priority={priority} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" />
      </div>
    </figure>
  );
}
