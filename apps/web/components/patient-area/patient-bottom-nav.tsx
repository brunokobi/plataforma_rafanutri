'use client';

import { BookOpen, Home, Lightbulb, MessageCircle, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUnreadCount } from '@/components/messages/use-unread';
import { getMyUnread } from '@/lib/messages/actions';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/p', label: 'Início', icon: Home, match: (p: string) => p === '/p' },
  { href: '/p/plano', label: 'Plano', icon: UtensilsCrossed, match: (p: string) => p.startsWith('/p/plano') },
  { href: '/p/mensagens', label: 'Mensagens', icon: MessageCircle, match: (p: string) => p.startsWith('/p/mensagens') },
  { href: '/p/receitas', label: 'Receitas', icon: BookOpen, match: (p: string) => p.startsWith('/p/receitas') },
  { href: '/p/recomendacoes', label: 'Orientações', icon: Lightbulb, match: (p: string) => p.startsWith('/p/recomendacoes') },
] as const;

/** RN-204 — Navegação inferior da área do paciente (alvos de 56 px, respeita a área segura do iPhone). */
export function PatientBottomNav({ color }: { color?: string }) {
  const pathname = usePathname() ?? '/p';
  const unread = useUnreadCount(getMyUnread);
  return (
    <nav aria-label="Área do paciente" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          const badge = href === '/p/mensagens' && unread > 0 ? unread : 0;
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined}
                aria-label={badge ? `${label}, ${badge} ${badge === 1 ? 'nova' : 'novas'}` : undefined}
                className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium transition-colors', active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                style={active && color ? { color } : undefined}>
                <span className={cn('relative grid h-7 w-12 place-items-center rounded-full transition-colors', active && 'bg-secondary')}>
                  <Icon className="size-5" aria-hidden="true" />
                  {badge > 0 && (
                    <span aria-hidden="true" className="absolute -right-0.5 -top-1 grid min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-background">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
