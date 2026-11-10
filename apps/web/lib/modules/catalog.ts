/** Catálogo dos módulos da plataforma (spec: docs/specs/tela-principal-modulos.md). */

export type ModuleCode = 'clinical' | 'patient_area' | 'practice' | 'ai' | 'maternal' | 'uan' | 'public_health';

export type IconName = 'stethoscope' | 'smartphone' | 'briefcase' | 'sparkles' | 'baby' | 'chef-hat' | 'landmark';

export interface ModuleDefinition {
  code: ModuleCode;
  name: string;
  summary: string;
  includes: string[];
  icon: IconName;
  /** Fase do roadmap em que o módulo é entregue. */
  phase: string;
  /** `available` quando já pode ser aberto; `building` enquanto não foi publicado. */
  availability: 'available' | 'building';
  /** Rota do módulo quando estiver disponível. */
  href?: string;
  /** Demonstração navegável enquanto o módulo está em construção. */
  demoHref?: string;
}

export const MODULES: readonly ModuleDefinition[] = [
  {
    code: 'clinical',
    name: 'Clínico e Esportivo',
    summary: 'Do cadastro do paciente ao plano alimentar em PDF, com cálculos validados.',
    includes: ['Pacientes, agenda e prontuário', 'Anamnese por link', 'Avaliação e composição corporal', 'Plano alimentar com substituições'],
    icon: 'stethoscope',
    phase: 'Fase 1',
    availability: 'building',
    demoHref: '/app/pacientes',
  },
  {
    code: 'patient_area',
    name: 'Área do paciente',
    summary: 'Seu paciente acompanha o plano pelo celular, com a sua marca.',
    includes: ['Plano alimentar publicado', 'Receitas com foto', 'Recomendações individuais', 'Documentos em PDF'],
    icon: 'smartphone',
    phase: 'Fase 1B',
    availability: 'building',
  },
  {
    code: 'practice',
    name: 'Gestão do consultório',
    summary: 'Menos tarefas manuais e mais retorno dos pacientes.',
    includes: ['Lembretes por WhatsApp', 'Agendamento online', 'Financeiro e pacotes', 'Funil de pacientes'],
    icon: 'briefcase',
    phase: 'Fase 2',
    availability: 'building',
  },
  {
    code: 'ai',
    name: 'Assistente de IA',
    summary: 'Sugestões para acelerar a consulta. A IA sugere, você decide.',
    includes: ['Sugestão de plano alimentar', 'Resumo da anamnese', 'Ideias de receitas', 'Consulta a diretrizes'],
    icon: 'sparkles',
    phase: 'Fase 3',
    availability: 'building',
  },
  {
    code: 'maternal',
    name: 'Materno-infantil',
    summary: 'Acompanhamento de crianças, gestantes e lactantes.',
    includes: ['Curvas de crescimento da OMS', 'Ganho de peso gestacional', 'Introdução alimentar', 'Alertas de desvio'],
    icon: 'baby',
    phase: 'Fase 4',
    availability: 'building',
  },
  {
    code: 'uan',
    name: 'UAN e Qualidade',
    summary: 'Cozinhas e serviços de alimentação sem papel e sem planilha.',
    includes: ['Checklists de Boas Práticas', 'Registro de temperaturas', 'Ficha técnica e cardápio', 'Compras e estoque'],
    icon: 'chef-hat',
    phase: 'Fase 5',
    availability: 'building',
  },
  {
    code: 'public_health',
    name: 'Saúde pública',
    summary: 'Triagem e acompanhamento de grupos populacionais.',
    includes: ['Triagens NRS-2002, MNA e MUST', 'Programas e grupos', 'Indicadores coletivos', 'Relatórios por território'],
    icon: 'landmark',
    phase: 'Fase 6',
    availability: 'building',
  },
];
