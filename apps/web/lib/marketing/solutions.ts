/**
 * Páginas públicas por área (/solucoes/[slug]), escritas para as buscas de nutricionistas.
 * Só descreve o que já está em produção; o que depende de contrato ou validação vem dito.
 */
export interface Solution {
  slug: string;
  /** Nome curto (menu, cartões, breadcrumb). */
  name: string;
  /** <title> da página (até ~60 caracteres). */
  title: string;
  /** meta description (até ~155 caracteres). */
  description: string;
  keywords: string[];
  /** H1 e subtítulo. */
  h1: string;
  lead: string;
  audience: string;
  features: Array<{ title: string; text: string }>;
  /** Plano em que a área está. */
  plan: string;
  faq: Array<{ q: string; a: string }>;
  cta: { label: string; href: string };
}

export const SOLUTIONS: Solution[] = [
  {
    slug: 'nutricao-clinica',
    name: 'Nutrição clínica',
    title: 'Software para nutricionista clínico: plano alimentar e prontuário',
    description: 'Anamnese por link, avaliação antropométrica, cálculo energético e plano alimentar com TACO em tempo real. Grátis até 20 pacientes.',
    keywords: ['software para nutricionista', 'programa para nutricionista', 'plano alimentar online', 'prontuário nutricional', 'tabela TACO', 'cálculo de dieta'],
    h1: 'Software para nutricionista clínico',
    lead: 'Da anamnese ao plano alimentar em minutos: prontuário, avaliação, cálculo energético e área do paciente no mesmo lugar, no computador ou no celular.',
    audience: 'Nutricionistas de consultório, clínicas e atendimento online.',
    features: [
      { title: 'Anamnese e questionários por link', text: 'Modelos prontos ou criados por você, com perguntas condicionais. O paciente responde antes da consulta e as respostas entram no prontuário.' },
      { title: 'Avaliação antropométrica', text: 'Peso, altura, circunferências, dobras cutâneas e protocolos clássicos de composição corporal, com gráficos de evolução.' },
      { title: 'Gasto energético', text: 'Equações de taxa metabólica basal e fator de atividade, com a meta calórica e de macronutrientes ligada ao plano.' },
      { title: 'Plano alimentar com cálculo em tempo real', text: 'Base com cerca de 17 mil alimentos (TACO 4ª edição, IBGE, USDA e rótulos do Open Food Facts), medidas caseiras, substituições e totais por refeição e por dia.' },
      { title: 'Área do paciente e PDF com a sua marca', text: 'O paciente vê o plano, as receitas e as recomendações no celular. PDFs saem com o seu logo e as suas cores.' },
      { title: 'Painel de todos os pacientes', text: 'Visão geral do consultório e painel de cada paciente, com evolução, retornos e quem precisa de atenção.' },
    ],
    plan: 'Disponível no plano Gratuito (até 20 pacientes ativos) e nos planos pagos.',
    faq: [
      { q: 'Qual tabela de composição de alimentos a Rafanutri usa?', a: 'TACO (4ª edição), IBGE (POF 2008-2009), USDA e produtos industrializados pelo rótulo (Open Food Facts), além dos alimentos e preparações que você cadastrar.' },
      { q: 'Posso usar de graça?', a: 'Sim. O plano Gratuito não tem prazo e atende até 20 pacientes ativos; pacientes arquivados não contam.' },
      { q: 'O paciente precisa instalar um aplicativo?', a: 'Não. A área do paciente abre no navegador do celular, com o plano alimentar, receitas e recomendações.' },
    ],
    cta: { label: 'Criar conta grátis', href: '/cadastro' },
  },
  {
    slug: 'nutricao-esportiva',
    name: 'Nutrição esportiva',
    title: 'Software de nutrição esportiva: composição corporal e plano',
    description: 'Avaliação com dobras e perfil antropométrico, gasto energético por atividade, suplementação e acompanhamento de atletas em um só lugar.',
    keywords: ['software nutrição esportiva', 'nutricionista esportivo', 'avaliação de composição corporal', 'dobras cutâneas', 'plano alimentar para atletas'],
    h1: 'Nutrição esportiva com visão de desempenho',
    lead: 'Acompanhe atletas e praticantes de atividade física com avaliação de composição corporal, gasto por atividade e plano alimentar ajustado à rotina de treino.',
    audience: 'Nutricionistas esportivos, academias e assessorias.',
    features: [
      { title: 'Ficha do atleta com visual próprio', text: 'Marque o paciente como esportivo e a ficha ganha um painel de desempenho, com a evolução da composição corporal em destaque.' },
      { title: 'Composição corporal', text: 'Dobras cutâneas, circunferências e protocolos clássicos, com percentual de gordura, massa magra e gráficos ao longo do tempo.' },
      { title: 'Gasto energético por atividade', text: 'Taxa metabólica basal com fator de atividade e acréscimos do treino, ligada às metas de macronutrientes do plano.' },
      { title: 'Plano alimentar por horário de treino', text: 'Refeições pré e pós-treino, substituições e totais em tempo real, com a base de alimentos brasileira.' },
      { title: 'Prescrição de suplementos', text: 'Documento de prescrição com a sua marca, entregue no PDF e na área do paciente.' },
    ],
    plan: 'Disponível em todos os planos; o painel esportivo aparece para os pacientes marcados como esportivos.',
    faq: [
      { q: 'Dá para usar protocolos de dobras cutâneas?', a: 'Sim. A avaliação traz dobras, circunferências e protocolos clássicos de composição corporal, com gráficos de evolução.' },
      { q: 'O atleta vê o plano no celular?', a: 'Sim. O plano, as receitas e as recomendações ficam na área do paciente, sem instalar aplicativo.' },
    ],
    cta: { label: 'Criar conta grátis', href: '/cadastro' },
  },
  {
    slug: 'materno-infantil',
    name: 'Materno-infantil',
    title: 'Software de nutrição materno-infantil: curvas da OMS e gestação',
    description: 'Curvas de crescimento da OMS com escore-z, ganho de peso na gestação, lactação, introdução alimentar e app para a família acompanhar.',
    keywords: ['curvas de crescimento OMS', 'escore-z', 'nutrição pediátrica', 'ganho de peso gestacional', 'introdução alimentar', 'nutricionista materno-infantil'],
    h1: 'Nutrição materno-infantil, da gestação à infância',
    lead: 'Curvas da OMS com alertas, ganho de peso gestacional, amamentação e introdução alimentar, com a família acompanhando pelo celular.',
    audience: 'Nutricionistas pediátricos, de gestantes e equipes materno-infantis.',
    features: [
      { title: 'Curvas de crescimento da OMS', text: 'Peso, estatura e IMC por idade com escore-z e classificação, gráficos com as faixas esperadas e alertas quando a medida sai da faixa.' },
      { title: 'Ganho de peso na gestação', text: 'Acompanhamento semana a semana pelas curvas brasileiras, com a faixa esperada conforme o IMC pré-gestacional.' },
      { title: 'Adicional energético e lactação', text: 'Adicional de energia na gestação e na amamentação aplicado ao plano, com o registro do tipo de aleitamento.' },
      { title: 'Introdução alimentar', text: 'Checklist de alimentos alergênicos e de texturas por idade; o responsável registra a primeira oferta e reações, e você é avisado das reações sérias.' },
      { title: 'Responsáveis legais com consentimento', text: 'Cadastro dos responsáveis pela criança e acesso da família ao acompanhamento, em linguagem simples, só com o que você liberar.' },
    ],
    plan: 'Disponível nos planos Profissional e Clínica.',
    faq: [
      { q: 'A família vê o escore-z?', a: 'Não. No app, as curvas aparecem em linguagem simples, sem escore-z, e só depois que o nutricionista libera o acompanhamento.' },
      { q: 'Quais referências são usadas?', a: 'Curvas de crescimento da Organização Mundial da Saúde para crianças e curvas brasileiras de ganho de peso para gestantes.' },
    ],
    cta: { label: 'Conhecer os planos', href: '/#planos' },
  },
  {
    slug: 'uan',
    name: 'UAN e alimentação coletiva',
    title: 'Software para UAN: ficha técnica, cardápio, estoque e custos',
    description: 'Ficha técnica com FC, custo e nutrientes, cardápio cíclico, compras, estoque FEFO, desperdício e custos planejado x realizado para UAN.',
    keywords: ['software para UAN', 'ficha técnica de preparo', 'cardápio cíclico', 'controle de estoque restaurante', 'alimentação coletiva', 'rotulagem nutricional'],
    h1: 'Gestão de UAN: da ficha técnica ao custo da refeição',
    lead: 'Para restaurantes, cozinhas industriais, hospitais, escolas e hotéis: ficha técnica, cardápio, produção, compras e estoque ligados aos custos.',
    audience: 'Nutricionistas de alimentação coletiva, responsáveis técnicos e gestores de unidades.',
    features: [
      { title: 'Insumos e ficha técnica', text: 'Catálogo de insumos com fornecedores e preços; fichas com fator de correção, índice de cocção, rendimento, custo, nutrientes, alergênicos e foto.' },
      { title: 'Cardápio cíclico', text: 'Cardápio com aprovação, perfis de público com metas nutricionais, regras do contrato e cardápio público com QR Code, modo TV e pesquisa de satisfação.' },
      { title: 'Produção e desperdício', text: 'Número de comensais, lista de preparo, requisição ao estoque e registro de sobra e resto.' },
      { title: 'Compras e estoque', text: 'Necessidade de compra, pedido, recebimento com recusa e foto, lotes por validade (FEFO) e inventário cego.' },
      { title: 'Custos e rede', text: 'Custo planejado x realizado, curva ABC, painel da rede de unidades e relatório mensal em PDF.' },
      { title: 'Rotulagem nutricional', text: 'Tabela nutricional da IN 75/2020 (vertical, horizontal e linear), com lupa frontal e alergênicos.' },
    ],
    plan: 'Plano Enterprise UAN, por contrato e por unidade.',
    faq: [
      { q: 'Dá para importar fornecedores, insumos e fichas?', a: 'Sim. A implantação importa fornecedores, insumos e fichas técnicas por planilha, e há um catálogo básico de insumos para começar.' },
      { q: 'Funciona com várias unidades?', a: 'Sim. Cada unidade tem a sua equipe e os seus registros, e o painel da rede compara as unidades.' },
    ],
    cta: { label: 'Falar sobre a sua UAN', href: '/cadastro' },
  },
  {
    slug: 'boas-praticas-rdc-216',
    name: 'Boas Práticas (RDC 216)',
    title: 'Checklist RDC 216 e Boas Práticas no celular | POP e Manual',
    description: 'Checklist da RDC 216/2004 no celular com foto e assinatura, temperaturas, não conformidades com 5W2H, POPs, Manual de Boas Práticas e APPCC.',
    keywords: ['checklist RDC 216', 'boas práticas de fabricação', 'manual de boas práticas', 'POP alimentos', 'controle de temperatura', 'APPCC', 'RDC 275'],
    h1: 'Boas Práticas da RDC 216 sem papel',
    lead: 'Checklists no celular, temperaturas, não conformidades com plano de ação e documentação pronta para a fiscalização sanitária.',
    audience: 'Serviços de alimentação, cozinhas industriais e hospitalares, escolas, restaurantes e consultorias em segurança dos alimentos.',
    features: [
      { title: 'Checklist RDC 216 pronto', text: 'Modelo da RDC 216/2004 com 10 seções e 58 itens, além de higiene de manipuladores, recebimento, higienização, pragas e água; todos editáveis.' },
      { title: 'No celular, até sem internet', text: 'A equipe preenche no celular com foto e assinatura; o registro sobe quando a conexão volta.' },
      { title: 'Temperaturas com alerta', text: 'Registro de equipamentos e alimentos com faixas configuráveis e alerta quando sai do limite.' },
      { title: 'Não conformidades com 5W2H', text: 'Cada item reprovado vira não conformidade com plano de ação, responsável e prazo, até o fechamento.' },
      { title: 'POPs, Manual e treinamentos', text: 'POPs e Manual de Boas Práticas com versão, aprovação e ciência da equipe; treinamentos com certificado; dossiê em PDF para a fiscalização.' },
      { title: 'APPCC', text: 'Plano APPCC com árvore decisória do Codex, pontos críticos de controle e PDF.' },
    ],
    plan: 'Plano Enterprise UAN, por contrato e por unidade.',
    faq: [
      { q: 'O checklist segue a RDC 216?', a: 'Sim. O modelo padrão segue a RDC 216/2004, em 10 seções e 58 itens, e pode ser ajustado à unidade e às normas estaduais e municipais.' },
      { q: 'Os registros podem ser alterados depois?', a: 'Não. Os registros não são apagados e têm verificação de integridade, o que dá segurança na fiscalização e na auditoria.' },
    ],
    cta: { label: 'Falar sobre Boas Práticas', href: '/cadastro' },
  },
  {
    slug: 'saude-publica',
    name: 'Saúde pública',
    title: 'Triagem nutricional NRS-2002, MUST e ASG | Saúde pública',
    description: 'Triagem nutricional NRS-2002, MUST e ASG com cálculo automático e painel de pacientes em risco para UBS, ambulatórios e programas.',
    keywords: ['triagem nutricional', 'NRS-2002', 'MUST', 'avaliação subjetiva global', 'risco nutricional', 'nutrição em saúde pública'],
    h1: 'Triagem nutricional e painel de risco',
    lead: 'Aplique NRS-2002, MUST e ASG com a pontuação calculada na hora e acompanhe quem está em risco nutricional.',
    audience: 'UBS, ambulatórios, hospitais e programas de saúde.',
    features: [
      { title: 'Três ferramentas de triagem', text: 'NRS-2002, MUST e Avaliação Subjetiva Global, com a pontuação e a classificação de risco calculadas automaticamente.' },
      { title: 'Dados já preenchidos', text: 'IMC, idade e perda de peso nos últimos meses vêm das avaliações já registradas do paciente.' },
      { title: 'Painel de risco', text: 'Última triagem de cada paciente, contagem por risco e lista de quem está em risco médio ou alto.' },
    ],
    plan: 'Módulo habilitado por contrato.',
    faq: [
      { q: 'A MNA está disponível?', a: 'Ainda não: a Mini Avaliação Nutricional depende de licença de uso, em andamento.' },
    ],
    cta: { label: 'Falar sobre o módulo', href: '/cadastro' },
  },
];

export const solutionBySlug = (slug: string) => SOLUTIONS.find((s) => s.slug === slug);
