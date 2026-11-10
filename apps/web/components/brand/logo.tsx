import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn('size-8', className)}>
      <rect width="64" height="64" rx="16" className="fill-primary" />
      <path
        d="M47 15C30 15 18 25 18 40c0 4 1 7 3 9 2-9 9-17 19-21-8 6-13 13-15 23 3 1 5 1 8 1 14 0 21-13 14-37z"
        className="fill-primary-foreground"
      />
    </svg>
  );
}

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <LogoMark />
      <span className="font-display text-xl">Rafanutri</span>
    </Link>
  );
}
