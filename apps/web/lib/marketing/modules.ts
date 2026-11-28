/**
 * Páginas de cada módulo (/recursos/[slug]): o que o módulo faz, com as telas reais do produto.
 * Texto de vitrine: tudo no presente, como parte do produto (sem "novo", "em breve" ou datas).
 * As imagens ficam em public/marketing (capturas do Consultório de demonstração, dados fictícios).
 */
export type ShotKind = 'phone' | 'desktop';
export interface Shot { src: string; alt: string; kind: ShotKind }
export type ModuleIcon = 'stethoscope' | 'smartphone' | 'message' | 'dumbbell' | 'baby' | 'briefcase' | 'sparkles' | 'chef' | 'landmark';

export interface ModulePage {
  slug: string;
  name: string;
  icon: ModuleIcon;
  /** Frase curta do cartão na página inicial. */
  tagline: string;
  title: string;
  description: string;
  keywords: string[];
  h1: string;
  lead: string;
  hero: Shot;
  /** Três destaques logo abaixo do topo. */
  highlights: Array<{ value: string; label: string }>;
  sections: Array<{ eyebrow: string; title: string; text: string; bullets: string[]; shot: Shot }>;
  plan: string;
  faq: Array<{ q: string; a: string }>;
}

const img = (name: string, alt: string, kind: ShotKind = 'desktop'): Shot => ({ src: `/marketing/${name}.jpg`, alt, kind });

export const MODULES: ModulePage[] = [
  {
    slug: 'consultorio-clinico',
    name: 'Consultório clínico',
    icon: 'stethoscope',
    tagline: 'Ficha completa, avaliação, plano alimentar com cálculo em tempo real e prontuário.',
    title: 'Consultório clínico: ficha, avaliação e plano alimentar | Rafanutri',
    description: 'Ficha do paciente, anamnese por link, avaliação antropométrica, planos sugeridos e plano alimentar com TACO calculado em tempo real. Grátis até 20 pacientes.',
    keywords: ['software para nutricionista', 'plano alimentar online', 'prontuário nutricional', 'avaliação antropométrica', 'tabela TACO'],
    h1: 'Do primeiro contato ao plano publicado, sem papel e sem planilha',
    lead: 'Tudo do paciente numa ficha só: dados, anamnese, avaliações, planos, prontuário, documentos e o que ele registra em casa. Você atende mais rápido e com mais segurança.',
    hero: img('clinico-ficha', 'Ficha da paciente com resumo de consultas, peso, plano alimentar, prontuário e área do paciente'),
    highlights: [
      { value: '17 mil', label: 'alimentos com medidas caseiras (TACO, IBGE, USDA e rótulos)' },
      { value: '79', label: 'modelos de plano prontos para adaptar' },
      { value: '1 clique', label: 'para publicar o plano no celular do paciente' },
    ],
    sections: [
      {
        eyebrow: 'Painel do dia',
        title: 'Comece o dia sabendo quem precisa de você',
        text: 'Consultas de hoje, anamneses para revisar e a lista de pacientes que precisam de atenção, com o motivo: retorno atrasado, plano vencendo, sem avaliação ou parado no app.',
        bullets: ['Atalhos para novo paciente, nova consulta e modelos', 'Pacientes que precisam de atenção, filtrados por motivo', 'Indicadores do consultório: ativos, planos publicados, faltas e uso do app'],
        shot: img('clinico-painel', 'Painel clínico com consultas do dia, anamneses para revisar e pacientes que precisam de atenção'),
      },
      {
        eyebrow: 'Ficha do paciente',
        title: 'Tudo do paciente num lugar só',
        text: 'Resumo com consultas, peso, plano e prontuário. Abas para avaliações, planos, anamneses, recomendações, documentos e triagens, e um botão para mandar mensagem na hora.',
        bullets: ['Alertas de saúde tirados da anamnese', 'Evolução de peso e medidas em gráfico', 'Planos sugeridos pelo perfil, objetivo e anamnese'],
        shot: img('clinico-planos', 'Planos sugeridos na ficha com o motivo da sugestão e os botões criar plano e imprimir'),
      },
      {
        eyebrow: 'Avaliação',
        title: 'Avaliação antropométrica completa',
        text: 'Peso, altura, circunferências e dobras cutâneas com os protocolos clássicos. IMC, relação cintura-estatura e composição corporal calculados sozinhos, com histórico em gráfico.',
        bullets: ['Protocolos de dobras e equações de densidade', 'Classificação automática e risco pela cintura', 'Comparação entre avaliações'],
        shot: img('clinico-avaliacao', 'Tela de avaliações com a evolução de peso e medidas da paciente'),
      },
      {
        eyebrow: 'Acompanhamento em casa',
        title: 'Veja o que o paciente faz entre as consultas',
        text: 'Pesagens com dia e horário, água bebida, metas marcadas e refeições do plano feitas aparecem na ficha. Você cria as metas e a meta de água, e o paciente acompanha pelo app.',
        bullets: ['Peso de casa e do consultório no mesmo gráfico, com o peso-meta', 'Água dos últimos 14 dias e sequência de dias com a meta', 'Adesão às refeições do plano em porcentagem'],
        shot: img('clinico-acompanhamento', 'Bloco Acompanhamento em casa com peso, água, metas e refeições do plano'),
      },
    ],
    plan: 'Disponível em todos os planos, inclusive no Gratuito (até 20 pacientes ativos).',
    faq: [
      { q: 'Preciso montar o plano do zero?', a: 'Não. A ficha sugere modelos da biblioteca pelo perfil, idade, gestação, objetivo e anamnese, já ajustados à meta de energia. Você revisa e publica.' },
      { q: 'Funciona no celular?', a: 'Sim. A ficha, a agenda, as mensagens e o prontuário foram desenhados para a tela do celular, com barra de atalhos embaixo.' },
      { q: 'O paciente vê tudo o que eu registro?', a: 'Não. Você escolhe por paciente o que aparece: calorias, macros, histórico de peso, IMC, água, metas e refeições.' },
    ],
  },
  {
    slug: 'app-do-paciente',
    name: 'App do paciente',
    icon: 'smartphone',
    tagline: 'Plano no celular, progresso, água, metas e conversa direta com o nutricionista.',
    title: 'App do paciente com plano, metas, água e mensagens | Rafanutri',
    description: 'Área do paciente com a marca do consultório: plano alimentar, meu progresso com peso e IMC, lembretes de água, metas, refeições feitas e mensagens com o nutricionista.',
    keywords: ['app para paciente de nutricionista', 'acompanhamento nutricional online', 'lembrete de beber água', 'metas nutricionais', 'área do paciente'],
    h1: 'O seu paciente acompanhado todos os dias, não só na consulta',
    lead: 'Com a marca do seu consultório, o paciente abre o plano, registra o peso, bebe água com lembrete, marca as metas e fala com você por mensagem. Tudo volta para a sua ficha.',
    hero: img('app-progresso', 'Tela Meu progresso no celular com perfil, peso atual, IMC e peso-meta', 'phone'),
    highlights: [
      { value: '24 h', label: 'de acompanhamento entre as consultas' },
      { value: '3 s', label: 'para a mensagem chegar do outro lado' },
      { value: '100%', label: 'com a marca e as cores do seu consultório' },
    ],
    sections: [
      {
        eyebrow: 'Meu progresso',
        title: 'Perfil completo e evolução que motiva',
        text: 'Nome, idade, altura, peso atual, IMC com régua de faixas, cintura e peso-meta. O gráfico junta as pesagens de casa e as do consultório, com a linha da meta.',
        bullets: ['Registrar peso em segundos, com dia e horário gravados', 'Observação da pesagem: em jejum, depois do treino', 'Variação desde o início e quanto falta para a meta'],
        shot: img('app-peso', 'Gráfico do peso no celular com pesagens de casa e do consultório e a linha da meta', 'phone'),
      },
      {
        eyebrow: 'Água',
        title: 'Meta de água com um toque e lembrete no Telegram',
        text: 'Anel de progresso do dia, toques de copo, copo grande e garrafinha, sequência de dias com a meta batida e barras da semana. O lembrete chega no intervalo que o paciente escolher e para quando a meta é batida.',
        bullets: ['Meta definida pelo nutricionista ou calculada pelo peso', 'Desfazer o último registro', 'Lembretes entre o horário de início e de fim'],
        shot: img('app-agua', 'Água do dia no celular com anel de progresso, botões de copo e lembretes', 'phone'),
      },
      {
        eyebrow: 'Metas e refeições',
        title: 'Hábitos marcados no dia a dia',
        text: 'As metas que você cria aparecem para o paciente marcar: comer frutas, caminhar, jantar mais cedo. As refeições do plano também podem ser marcadas como feitas, e você vê a adesão.',
        bullets: ['Metas diárias ou algumas vezes por semana', 'Progresso da semana em barra', 'Refeições de hoje com um toque'],
        shot: img('app-metas', 'Metas da paciente com progresso da semana e refeições do plano marcadas', 'phone'),
      },
      {
        eyebrow: 'Mensagens',
        title: 'Conversa direta, como num app de mensagens',
        text: 'O paciente tira dúvidas pelo app e você responde pelo computador ou pelo celular. Balões, horário, confirmação de leitura e aviso no Telegram ou e-mail quando uma mensagem fica sem resposta.',
        bullets: ['Novas mensagens na hora, sem atualizar a tela', 'Tiques de enviada e lida', 'O consultório pode pausar o recebimento quando quiser'],
        shot: img('app-mensagens', 'Conversa entre paciente e nutricionista no celular, com balões e confirmação de leitura', 'phone'),
      },
    ],
    plan: 'Incluído em todos os planos. O paciente entra por convite, com e-mail e senha ou com o Google.',
    faq: [
      { q: 'O paciente precisa baixar algum aplicativo?', a: 'Não. Ele abre pelo navegador do celular e pode adicionar à tela inicial como um app.' },
      { q: 'E pacientes com transtorno alimentar?', a: 'Quando a anamnese ou o objetivo indicam transtorno alimentar, o app esconde peso e IMC sozinho e foca em hábitos. Você pode mudar quando quiser.' },
      { q: 'Como chegam os lembretes?', a: 'Pelo Telegram do paciente, que ele liga em um toque. Avisos importantes, como consultas, também vão por e-mail.' },
    ],
  },
  {
    slug: 'mensagens',
    name: 'Mensagens com o paciente',
    icon: 'message',
    tagline: 'Chat com cada paciente, com leitura confirmada e avisos fora do app.',
    title: 'Chat entre nutricionista e paciente | Rafanutri',
    description: 'Converse com cada paciente pela Rafanutri: mensagens na hora, confirmação de leitura, lista de conversas com não lidas e aviso no Telegram ou e-mail.',
    keywords: ['chat com paciente nutricionista', 'mensagens paciente', 'atendimento nutricional online', 'whatsapp nutricionista alternativa'],
    h1: 'As dúvidas do paciente no lugar certo: junto da ficha',
    lead: 'Separe o pessoal do profissional. Cada conversa fica ligada à ficha do paciente, com histórico, e você responde do computador ou do celular.',
    hero: img('mensagens-desktop', 'Caixa de mensagens no computador com a lista de conversas e a conversa aberta ao lado'),
    highlights: [
      { value: '3 s', label: 'para a mensagem aparecer na outra tela' },
      { value: '✓✓', label: 'confirmação de leitura nos dois lados' },
      { value: '5 min', label: 'sem leitura e o aviso sai no Telegram ou e-mail' },
    ],
    sections: [
      {
        eyebrow: 'Caixa de mensagens',
        title: 'Todas as conversas, com as não lidas primeiro',
        text: 'Lista com busca, prévia da última mensagem e contador de não lidas no menu. No computador, a conversa abre ao lado da lista. No celular, ocupa a tela toda.',
        bullets: ['Contador de não lidas no menu e na barra do celular', 'Botão Mensagem direto na ficha do paciente', 'Atalho para abrir a ficha de dentro da conversa'],
        shot: img('mensagens-celular', 'Conversa com a paciente no celular do nutricionista', 'phone'),
      },
    ],
    plan: 'Incluído em todos os planos.',
    faq: [
      { q: 'O conteúdo da mensagem vai no aviso?', a: 'Não. O aviso no Telegram ou por e-mail diz só que há mensagem nova. O texto fica protegido dentro da plataforma.' },
      { q: 'Posso parar de receber mensagens?', a: 'Sim. Um botão pausa o recebimento; o paciente vê um aviso e você continua podendo escrever.' },
    ],
  },
  {
    slug: 'gestao-do-consultorio',
    name: 'Gestão do consultório',
    icon: 'briefcase',
    tagline: 'Agenda, lembretes de consulta, financeiro, pacotes e CRM de pacientes.',
    title: 'Agenda, financeiro e CRM para nutricionista | Rafanutri',
    description: 'Agenda semanal com lembretes no Telegram e e-mail, agendamento online, financeiro com pacotes de consultas e funil de pacientes para não perder retornos.',
    keywords: ['agenda para nutricionista', 'financeiro consultório nutrição', 'crm nutricionista', 'lembrete de consulta'],
    h1: 'O consultório organizado para você só atender',
    lead: 'Agenda com lembretes automáticos, agendamento online pela sua página, recebimentos e pacotes de consultas, e um funil para nenhum retorno ficar para trás.',
    hero: img('gestao-agenda', 'Agenda semanal do consultório com consultas confirmadas e horários livres'),
    highlights: [
      { value: 'Telegram', label: 'e e-mail para lembrar as consultas' },
      { value: 'Pix', label: 'e pacotes de consultas no financeiro' },
      { value: 'Funil', label: 'de pacientes do primeiro contato ao retorno' },
    ],
    sections: [
      {
        eyebrow: 'Financeiro',
        title: 'Recebimentos e pacotes sem planilha',
        text: 'Entradas e saídas por mês, pacotes de consultas com saldo, parcelas e recibos com a sua marca.',
        bullets: ['Resumo do mês e comparação com os anteriores', 'Pacotes com consultas usadas e restantes', 'Recibo em PDF'],
        shot: img('gestao-financeiro', 'Financeiro do consultório com entradas, saídas e resumo do mês'),
      },
      {
        eyebrow: 'CRM',
        title: 'Nenhum retorno esquecido',
        text: 'O funil mostra quem marcou a primeira consulta, quem está em acompanhamento e quem sumiu, com a lista de retornos atrasados.',
        bullets: ['Etapas automáticas pelo histórico de consultas', 'Origem dos pacientes', 'Retornos atrasados com um clique para remarcar'],
        shot: img('gestao-crm', 'Funil de pacientes com etapas e retornos atrasados'),
      },
    ],
    plan: 'Nos planos Essencial, Profissional e Clínica.',
    faq: [
      { q: 'O paciente consegue marcar sozinho?', a: 'Sim, pela página pública do consultório, nos horários que você liberar. Você confirma na agenda.' },
    ],
  },
  {
    slug: 'nutricao-esportiva',
    name: 'Nutrição esportiva',
    icon: 'dumbbell',
    tagline: 'Composição corporal, painel de atletas e planos para treino e competição.',
    title: 'Software para nutrição esportiva | Rafanutri',
    description: 'Painel de atletas, avaliação de composição corporal com dobras cutâneas e modelos de plano de hipertrofia, definição e endurance com pré e pós-treino.',
    keywords: ['nutrição esportiva software', 'plano alimentar hipertrofia', 'composição corporal atleta'],
    h1: 'Performance com números certos',
    lead: 'Painel só dos seus atletas, composição corporal com protocolos de dobras e modelos de plano para hipertrofia, definição e endurance, com pré e pós-treino.',
    hero: img('esportivo', 'Painel de alta performance com os atletas do consultório'),
    highlights: [
      { value: 'Dobras', label: 'protocolos clássicos de composição corporal' },
      { value: '3', label: 'linhas de modelos: hipertrofia, definição e endurance' },
      { value: 'Pré e pós', label: 'treino nos modelos de plano' },
    ],
    sections: [],
    plan: 'Disponível em todos os planos.',
    faq: [{ q: 'Serve para atleta amador?', a: 'Sim. Os modelos de hipertrofia, definição e endurance se ajustam à meta de energia de cada pessoa.' }],
  },
  {
    slug: 'materno-infantil',
    name: 'Materno-infantil',
    icon: 'baby',
    tagline: 'Curvas da OMS, ganho de peso na gestação, amamentação e introdução alimentar.',
    title: 'Nutrição materno-infantil: curvas da OMS e gestação | Rafanutri',
    description: 'Curvas de crescimento da OMS, ganho de peso gestacional, acompanhamento da amamentação e da introdução alimentar com alergênicos.',
    keywords: ['curvas da OMS', 'ganho de peso gestacional', 'introdução alimentar', 'nutrição infantil software'],
    h1: 'Do pré-natal à introdução alimentar',
    lead: 'Curvas de crescimento da OMS, ganho de peso gestacional por IMC pré-gestacional, amamentação e introdução alimentar com registro de reações.',
    hero: img('materno', 'Painel materno-infantil com gestantes, crianças e curvas de crescimento'),
    highlights: [
      { value: 'OMS', label: 'curvas de peso, altura, IMC e perímetro cefálico' },
      { value: 'Gestação', label: 'ganho de peso pelo IMC pré-gestacional' },
      { value: 'Alergênicos', label: 'acompanhados na introdução alimentar' },
    ],
    sections: [],
    plan: 'Nos planos Profissional e Clínica.',
    faq: [{ q: 'O responsável usa o app?', a: 'Sim. Para menores de idade, o app é do responsável, com o consentimento registrado.' }],
  },
  {
    slug: 'assistente-de-ia',
    name: 'Assistente de IA',
    icon: 'sparkles',
    tagline: 'Resumo da anamnese, ideias de receitas e respostas rápidas para conferir.',
    title: 'Assistente de IA para nutricionista | Rafanutri',
    description: 'Resumo da anamnese sem dados que identifiquem o paciente, sugestões de receitas e respostas para dúvidas, sempre para o nutricionista conferir.',
    keywords: ['inteligência artificial nutricionista', 'ia para nutrição'],
    h1: 'Mais tempo para o paciente, menos para digitar',
    lead: 'A IA resume a anamnese, sugere receitas e responde dúvidas. A decisão é sempre sua, e nada que identifique o paciente sai da plataforma.',
    hero: img('ia', 'Assistente de IA com perguntas e respostas sobre nutrição'),
    highlights: [
      { value: 'Sem nome', label: 'nem dados que identifiquem o paciente' },
      { value: 'Resumo', label: 'da anamnese antes da consulta' },
      { value: 'Receitas', label: 'sugeridas pelo que o paciente gosta' },
    ],
    sections: [],
    plan: 'Nos planos pagos.',
    faq: [{ q: 'A IA prescreve?', a: 'Não. Ela organiza e sugere; a conduta é sempre do nutricionista.' }],
  },
  {
    slug: 'uan-e-qualidade',
    name: 'UAN e Qualidade',
    icon: 'chef',
    tagline: 'Fichas técnicas, insumos, custos e Boas Práticas da RDC 216.',
    title: 'Software para UAN: fichas técnicas e boas práticas | Rafanutri',
    description: 'Fichas técnicas com custo e rendimento, catálogo de insumos, checklists de Boas Práticas da RDC 216, temperaturas e conformidade por unidade.',
    keywords: ['software UAN', 'ficha técnica de preparação', 'RDC 216 checklist', 'boas práticas de fabricação'],
    h1: 'Cozinha padronizada e auditoria em dia',
    lead: 'Fichas técnicas com custo, rendimento e fator de correção, catálogo de insumos, checklists da RDC 216 e conformidade de cada unidade num painel.',
    hero: img('uan', 'Painel de unidades de alimentação com conformidade e fichas técnicas'),
    highlights: [
      { value: 'RDC 216', label: 'checklists de Boas Práticas' },
      { value: 'Custo', label: 'por porção nas fichas técnicas' },
      { value: 'Rede', label: 'várias unidades num painel só' },
    ],
    sections: [],
    plan: 'No plano Empresa (UAN), por contrato.',
    faq: [{ q: 'Funciona sem internet?', a: 'Os checklists podem ser preenchidos sem conexão e sincronizam quando a internet volta.' }],
  },
  {
    slug: 'saude-publica',
    name: 'Saúde pública',
    icon: 'landmark',
    tagline: 'Triagens nutricionais NRS-2002, MUST e ASG com risco e acompanhamento.',
    title: 'Triagem nutricional NRS-2002, MUST e ASG | Rafanutri',
    description: 'Triagens nutricionais validadas com pontuação e classificação automáticas, risco por paciente e painel do serviço.',
    keywords: ['triagem nutricional', 'NRS-2002', 'MUST', 'ASG'],
    h1: 'Triagem nutricional rápida e rastreável',
    lead: 'NRS-2002, MUST e ASG com cálculo automático, risco na ficha e painel do serviço para priorizar quem precisa primeiro.',
    hero: img('saude-publica', 'Painel de triagens nutricionais com risco baixo, médio e alto'),
    highlights: [
      { value: '3', label: 'instrumentos validados' },
      { value: 'Risco', label: 'calculado e guardado com auditoria' },
      { value: 'Painel', label: 'do serviço por nível de risco' },
    ],
    sections: [],
    plan: 'Por contrato, para serviços e redes de saúde.',
    faq: [{ q: 'Os dados ficam auditados?', a: 'Sim. Cada triagem guarda quem fez, quando e a versão do instrumento, e não pode ser alterada depois.' }],
  },
];

export const moduleBySlug = (slug: string) => MODULES.find((m) => m.slug === slug) ?? null;
