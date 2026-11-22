'use client';

import {
  Apple, Baby, Stethoscope, Bell, Briefcase, Dumbbell, Landmark, BookOpen, Box, Building2, CalendarDays, ChefHat, ClipboardCheck, ClipboardList, Crown, FileSpreadsheet, Filter, Home,
  LayoutGrid, ListChecks, LogOut, Menu, Network, Salad, Search, Sparkles, Truck, Upload, Users, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react';
import Form from 'next/form';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { activeHref, navModel, type NavIcon } from '@/components/app/app-nav';
import { MODULE_THEME_LABEL, moduleThemeOf, type ModuleTheme } from '@/lib/modules/theme';
import { FeedbackButton } from '@/components/app/feedback-button';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { signOut } from '@/lib/auth/actions';
import { cn } from '@/lib/utils';

const ICONS: Record<NavIcon, LucideIcon> = {
  home: Home, dashboard: LayoutGrid, patients: Users, calendar: CalendarDays, sparkles: Sparkles, funnel: Filter, wallet: Wallet,
  chef: ChefHat, templates: ClipboardList, apple: Apple, recipes: Salad, questionnaires: ListChecks, guidelines: BookOpen,
  building: Building2, bell: Bell, crown: Crown, units: Warehouse, sheet: FileSpreadsheet, check: ClipboardCheck, network: Network,
  box: Box, truck: Truck, rules: ClipboardList, upload: Upload, landmark: Landmark, baby: Baby, sport: Dumbbell,
};

const THEME_ICON: Record<ModuleTheme, LucideIcon> = { clinical: Stethoscope, sport: Dumbbell, maternal: Baby, practice: Briefcase, ai: Sparkles, uan: ChefHat, public_health: Landmark };

export interface SidebarProps {
  homeHref?: string;
  patientsHref?: string;
  org: { name: string; initials: string; planName: string } | null;
  user: { name: string; initial: string; roleLabel: string } | null;
  uan: boolean;
  publicHealth?: boolean;
  maternal?: boolean;
  withSignOut: boolean;
}

function SidebarBody({ homeHref = '/app', patientsHref = '/app/pacientes', org, user, uan, publicHealth = false, maternal = false, withSignOut, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '';
  const groups = navModel(pathname, { homeHref, patientsHref, uan, publicHealth, maternal });
  const active = activeHref(pathname, groups.flatMap((g) => g.links.map((l) => l.href)));
  const searchRef = useRef<HTMLInputElement>(null);
  const inUan = pathname.startsWith('/app/uan');
  const theme = moduleThemeOf(pathname);

  // Ctrl+K / ⌘K: vai para a busca de paciente.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && searchRef.current && searchRef.current.getClientRects().length > 0) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 px-3.5 py-5">
      <Logo href={homeHref} className="px-2" />
      {theme && <ModuleSeal theme={theme} />}

      {org && (
        <Link href="/app/configuracoes/plano" onClick={onNavigate} className="flex min-h-[52px] items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/40">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-[13px] font-semibold text-secondary-foreground">{org.initials}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold">{org.name}</span>
            <span className="text-xs text-muted-foreground">Plano {org.planName}</span>
          </span>
        </Link>
      )}

      {!inUan && (
        <Form
          action={patientsHref}
          role="search"
          onSubmit={() => onNavigate?.()}
          className="flex min-h-10 items-center gap-2 rounded-[10px] border border-border bg-muted/60 px-2.5 text-muted-foreground focus-within:border-primary/50"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <label htmlFor="sidebar-search" className="sr-only">Buscar paciente</label>
          <input ref={searchRef} id="sidebar-search" name="q" type="search" placeholder="Buscar paciente…" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          <kbd className="hidden rounded-md border border-border bg-card px-1.5 text-[11px] font-medium sm:inline">Ctrl K</kbd>
        </Form>
      )}

      <nav aria-label="Área logada" className="-mx-1 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-1 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
        {groups.map((g) => (
          <div key={g.title ?? 'principal'} className="flex flex-col gap-0.5">
            {g.title && <span className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.title}</span>}
            {g.links.map((l) => {
              const Icon = ICONS[l.icon];
              const on = l.href === active;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onNavigate}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors',
                    on ? 'bg-secondary font-semibold text-secondary-foreground' : 'font-medium text-foreground/80 hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-border pt-3.5">
        {withSignOut && <FeedbackButton variant="sidebar" />}
        <div className="flex items-center gap-2.5 px-2 pt-2">
          {user && (
            <>
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">{user.initial}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.roleLabel}</span>
              </span>
            </>
          )}
          {!user && <span className="flex-1" />}
          <ThemeToggle />
          {withSignOut && (
            <form action={signOut}>
              <button type="submit" aria-label="Sair" title="Sair" className="grid size-11 place-items-center rounded-[10px] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                <LogOut className="size-[18px]" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Selo do módulo atual. Também marca a página ([data-module-page]) para o tema do módulo (globals.css). */
function ModuleSeal({ theme }: { theme: ModuleTheme }) {
  const Icon = THEME_ICON[theme];
  return (
    <p data-module-page={theme} className="module-seal -mt-2 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold">
      <Icon className="size-4" aria-hidden="true" />
      {MODULE_THEME_LABEL[theme]}
    </p>
  );
}

/**
 * Menu lateral da área logada. No computador (≥ 1024 px) fica fixo à esquerda e o conteúdo ganha margem
 * (globals.css: `body:has([data-app-sidebar])`). No celular e tablet vira uma barra no topo com gaveta.
 */
export function AppSidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside data-app-sidebar aria-label="Menu principal" className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-border bg-card/60 backdrop-blur-sm lg:block">
        <SidebarBody {...props} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/85 px-3 backdrop-blur-lg lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="grid size-11 place-items-center rounded-[10px] hover:bg-muted">
          <Menu className="size-5" />
        </button>
        <Logo href={props.homeHref ?? '/app'} />
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="h-dvh max-h-dvh w-[288px] max-w-[85vw] gap-0 overflow-hidden p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBody {...props} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
