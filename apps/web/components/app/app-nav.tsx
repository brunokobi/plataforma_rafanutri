// Modelo do menu lateral da área logada: grupos, links e ícones conforme a área (consultório ou UAN).

export type NavIcon =
  | 'home' | 'dashboard' | 'patients' | 'calendar' | 'sparkles' | 'funnel' | 'wallet' | 'chef'
  | 'templates' | 'apple' | 'recipes' | 'questionnaires' | 'guidelines' | 'building' | 'bell' | 'crown'
  | 'units' | 'sheet' | 'check' | 'network' | 'box' | 'truck' | 'rules' | 'upload' | 'landmark';

export type NavLink = { href: string; label: string; icon: NavIcon };
export type NavGroup = { title: string | null; links: NavLink[] };

/** Grupos do menu. `uan`: o consultório tem o módulo UAN (mostra o atalho na Gestão). */
export function navModel(pathname: string, opts: { homeHref?: string; patientsHref?: string; uan?: boolean; publicHealth?: boolean } = {}): NavGroup[] {
  const home = opts.homeHref ?? '/app';
  const account: NavGroup = {
    title: 'Conta',
    links: [
      { href: '/app/configuracoes/consultorio', label: 'Consultório', icon: 'building' },
      { href: '/app/configuracoes/avisos', label: 'Avisos', icon: 'bell' },
      { href: '/app/configuracoes/plano', label: 'Meu plano', icon: 'crown' },
    ],
  };
  if (pathname.startsWith('/app/uan')) {
    return [
      { title: null, links: [{ href: home, label: 'Início', icon: 'home' }, { href: '/app/uan', label: 'Unidades', icon: 'units' }] },
      {
        title: 'Operação',
        links: [
          { href: '/app/uan/fichas', label: 'Fichas técnicas', icon: 'sheet' },
          { href: '/app/uan/conformidade', label: 'Conformidade', icon: 'check' },
          { href: '/app/uan/rede', label: 'Rede', icon: 'network' },
        ],
      },
      {
        title: 'Cadastros',
        links: [
          { href: '/app/uan/insumos', label: 'Insumos', icon: 'box' },
          { href: '/app/uan/fornecedores', label: 'Fornecedores', icon: 'truck' },
          { href: '/app/uan/perfis', label: 'Perfis e regras', icon: 'rules' },
          { href: '/app/uan/importar', label: 'Importar planilhas', icon: 'upload' },
        ],
      },
      { ...account, links: account.links.filter((l) => l.icon !== 'bell') },
    ];
  }
  return [
    { title: null, links: [{ href: home, label: 'Início', icon: 'home' }, { href: '/app/clinico', label: 'Painel', icon: 'dashboard' }] },
    {
      title: 'Atendimento',
      links: [
        { href: opts.patientsHref ?? '/app/pacientes', label: 'Pacientes', icon: 'patients' },
        { href: '/app/agenda', label: 'Agenda', icon: 'calendar' },
        { href: '/app/assistente', label: 'Assistente de IA', icon: 'sparkles' },
      ],
    },
    {
      title: 'Gestão',
      links: [
        { href: '/app/crm', label: 'CRM', icon: 'funnel' },
        { href: '/app/financeiro', label: 'Financeiro', icon: 'wallet' },
        ...(opts.uan ? [{ href: '/app/uan', label: 'UAN e Qualidade', icon: 'chef' as const }] : []),
        ...(opts.publicHealth ? [{ href: '/app/saude-publica', label: 'Saúde pública', icon: 'landmark' as const }] : []),
      ],
    },
    {
      title: 'Conteúdo',
      links: [
        { href: '/app/modelos-de-plano', label: 'Modelos de plano', icon: 'templates' },
        { href: '/app/alimentos', label: 'Alimentos', icon: 'apple' },
        { href: '/app/receitas', label: 'Receitas', icon: 'recipes' },
        { href: '/app/questionarios', label: 'Questionários', icon: 'questionnaires' },
        { href: '/app/orientacoes', label: 'Orientações', icon: 'guidelines' },
      ],
    },
    account,
  ];
}

/** Link ativo: o mais específico que casa com a rota (Início só na própria página). */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  const hits = hrefs.filter((h) => pathname === h || (h !== '/app' && pathname.startsWith(`${h}/`)));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** "Consultório de Teste" → "CT". */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 || /^\p{Lu}/u.test(w));
  const letters = (words.length ? words : [name]).slice(0, 2).map((w) => w[0]!.toUpperCase());
  return letters.join('') || 'R';
}
