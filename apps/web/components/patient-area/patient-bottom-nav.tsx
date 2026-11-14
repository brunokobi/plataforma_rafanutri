'use client';

import { BookOpen, Home, MessageSquareText, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/p', label: 'Início', icon: Home, match: (p: string) => p === '/p' },
  { href: '/p/plano', label: 'Plano', icon: UtensilsCrossed, match: (p: string) => p.startsWith('/p/plano') },
  { href: '/p/receitas', label: 'Receitas', icon: BookOpen, match: (p: string) => p.startsWith('/p/receitas') },
  { href: '/p/recomendacoes', label: 'Recomendações', icon: MessageSquareText, match: (p: string) => p.startsWith('/p/recomendacoes') },
] as const;

/** RN-204 — Navegação inferior da área do paciente (alvos de 56 px, respeita a área segura do iPhone). */
export function PatientBottomNav({ color }: { color?: string }) {
  const pathname = usePathname() ?? '/p';
  return (
    <nav aria-label="Área do paciente" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium', active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                style={active && color ? { color } : undefined}>
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
