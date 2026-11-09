# Módulo UAN e Qualidade — plano do módulo

A Rafanutri é uma **plataforma** com vários módulos sobre um núcleo comum. A **UAN** (Unidades de Alimentação e Nutrição) é um desses módulos, voltado às empresas que produzem refeições em escala. Este documento define o módulo: para quem é, o que entrega, como se encaixa na plataforma e em que ordem será construído.

O detalhamento técnico item a item (SQL, regras de cálculo, tarefas, critérios de aceite e testes) está na [Fase 5](../plano/fase-5-uan-qualidade.md), com IDs RN-120 a RN-169. Este documento organiza esses itens em **entregas (releases)** do módulo.

## 1. Visão do módulo

**Problema.** Restaurantes industriais, cozinhas hospitalares, escolas, hotéis e serviços de catering controlam Boas Práticas, temperatura, fichas técnicas, cardápio e compras em papel e planilha. Na fiscalização sanitária, faltam registros, os POPs estão desatualizados e as não conformidades não têm plano de ação. O resultado são autuações, desperdício e custo de refeição sem controle.

**Proposta.** Uma unidade produtora opera **sem papel e sem planilha**:
- o nutricionista responsável técnico (RT) planeja o cardápio a partir de fichas técnicas com custo e nutrientes;
- a compra sai calculada do cardápio;
- a equipe registra checklists e temperaturas no celular;
- o dossiê para a fiscalização é gerado com um clique.

**Base legal principal:** ANVISA RDC 216/2004 (Boas Práticas em serviços de alimentação), complementada por normas estaduais e municipais. Rotulagem: RDC 429/2020 e IN 75/2020.

## 2. Personas e papéis

| Persona | Papel na plataforma | O que faz no módulo | Onde usa |
|---|---|---|---|
| Nutricionista RT | `technical_lead` | Fichas técnicas, cardápio, aprova documentos, trata não conformidades, responde à fiscalização | Computador |
| Gestor da empresa | `owner` (organização) ou `manager` (unidade) | Vê custos e conformidade de todas as unidades, contrata o módulo | Computador |
| Cozinheiro / manipulador | `cook` | Executa checklists, registra temperaturas, consulta fichas técnicas | Celular (inclusive offline) |
| Estoquista / comprador | `stock_keeper` | Pedidos, recebimento, estoque e inventário | Celular e computador |
| Auditor / consultor | `auditor` | Lê tudo da unidade, sem alterar; gera relatórios | Computador |

Os papéis valem **por unidade produtora** (RN-121 e RN-122). Uma empresa pode ter várias unidades, e cada pessoa só enxerga as unidades em que atua.

## 3. Como o módulo se encaixa na plataforma

### O que reaproveita do núcleo

| Do núcleo / outros módulos | Uso na UAN |
|---|---|
| Organizações, membros, RLS e auditoria (Fase 0) | Empresa = organização do tipo `company`; isolamento por organização e por unidade |
| Base de alimentos TACO/TBCA e `nutrition-core` (Fases 0 e 1) | Informação nutricional das fichas técnicas e dos cardápios |
| Receitas (RN-042, RN-206) | Ponto de partida da ficha técnica: a receita clínica vira ficha técnica com custo e rendimento industrial |
| Gerador de PDF com marca (RN-036) | Ficha técnica, relatórios e dossiê de fiscalização |
| n8n e WhatsApp (Fase 2) | Alertas de temperatura, checklists atrasados, validade de produtos |
| Planos e assinatura (RN-200, RN-057) | Contratação do módulo por unidade |
| Área mobile do paciente (Fase 1B/3) | Mesma base técnica (web mobile/PWA) para os checklists de chão de fábrica |

### Ativação do módulo

A plataforma trata cada módulo como uma **funcionalidade habilitável por organização**:
- `plans.features` define quais módulos cada plano inclui (ex.: `{"modules": ["clinical", "uan"]}`);
- a função `org_has_feature(org, 'uan')` (RN-122) controla menu, rotas e políticas RLS das tabelas do módulo;
- uma organização pode ter mais de um módulo. Exemplo: uma nutricionista que atende em consultório e presta consultoria a um restaurante;
- no MVP, antes da cobrança Enterprise, o módulo é habilitado manualmente pelo administrador da plataforma (sem checkout).

### Navegação

Com o módulo ativo, o menu do profissional ganha a seção **UAN**, com seletor de unidade:
- Painel
- Fichas técnicas
- Cardápios
- Compras
- Estoque
- Qualidade (checklists, temperaturas, não conformidades)
- Documentos (POPs, MBP e treinamentos)
- Relatórios

Rotas em `/[orgSlug]/uan/[unidade]/...` (ver a convenção de rotas em [00-visao-geral.md](../plano/00-visao-geral.md)).

## 4. Entregas do módulo

A ordem abaixo prioriza o **controle de qualidade (BPF)** antes de ficha técnica e compras, por três motivos:
- é a maior dor (multa e interdição);
- é o mais simples de adotar (o cozinheiro só precisa do celular);
- já existe experiência com o app **BPF Check** na vpsrafa (ver [ADR 0004](../adr/0004-infraestrutura-hospedagem.md)).

Essa ordem substitui a sequência original da Fase 5, que começava pela ficha técnica.

| Entrega | Nome | O que o cliente passa a fazer | Itens | Pontos | Semanas (2 devs) |
|---|---|---|---|---|---|
| **U0** | Descoberta e base | Empresa, unidades e equipe cadastradas, com papéis por unidade | RN-120, RN-121, RN-122, RN-123 | 14 | 1 |
| **U1** | **Qualidade BPF (MVP do módulo)** | Checklists no celular (com foto, assinatura e offline), temperaturas com alerta, não conformidades com plano de ação, painel de conformidade | RN-146 a RN-154, RN-165 | 48 | 3 |
| **U2** | Ficha técnica | Fichas com peso bruto e líquido, fator de correção, índice de cocção, rendimento, custo e informação nutricional, com versão e PDF | RN-125 a RN-134 | 37 | 2 |
| **U3** | Cardápio e compras | Cardápio cíclico com comensais e per capita, custo por refeição e lista de compras calculada | RN-135 a RN-140 | 31 | 2 |
| **U4** | Estoque | Recebimento com conferência, lotes e validade, saída FEFO, inventário e alertas | RN-141 a RN-145 | 18 | 1 |
| **U5** | Documentação BPF e fiscalização | POPs e Manual de Boas Práticas com versão e aprovação, treinamentos, dossiê para a fiscalização e trilha de auditoria | RN-155 a RN-159, RN-166, RN-167 | 25 | 1,5 |
| **U6** | Comercial e piloto | Contrato por unidade, onboarding com importação de dados, piloto acompanhado | RN-124, RN-168, RN-169 | 15 | 1 |
| **U7** | APPCC e rotulagem | Análise de perigos, PCC e monitoramento; tabela nutricional e rótulo com alerta frontal | RN-160 a RN-164 | 21 | 1,5 |

Pontos somados do [backlog](../07-backlog.md) (total da Fase 5: 209). Semanas calculadas a cerca de 18 pontos por semana com 2 desenvolvedores.

### MVP do módulo = U0 + U1

Com 62 pontos e cerca de 4 semanas, o MVP já é vendável para qualquer serviço de alimentação, porque resolve a exigência de registros da RDC 216. Inclui:
- empresa, unidades e equipe;
- biblioteca de checklists padrão (higiene de manipuladores, recebimento, temperatura de equipamentos, higienização de ambientes, controle de pragas, potabilidade da água), editável;
- execução no celular com foto, assinatura, geolocalização e funcionamento offline;
- agenda de checklists e cobrança dos atrasados (WhatsApp/e-mail via n8n);
- equipamentos com faixas de temperatura e alerta ao RT quando houver leitura fora da faixa;
- não conformidades com plano de ação 5W2H;
- painel de conformidade por unidade e período.

**Pré-requisitos da plataforma para o MVP do módulo:**
- RN-004 a RN-009, RN-200 e RN-050;
- base mobile da área do paciente (RN-204), reaproveitada para o layout dos checklists.

O PWA completo com push (RN-070 e RN-074) **não** é pré-requisito: no MVP os alertas saem por WhatsApp e e-mail pelo n8n.

### Versão completa = U0 a U6

Unidade operando cardápio → compras → recebimento → estoque → checklists → dossiê, sem planilha. É o critério de pronto da Fase 5. U7 entra conforme a demanda dos clientes.

## 5. Reaproveitamento do BPF Check

Primeira tarefa da U0 (RN-120). Levantar no BPF Check:

| Pergunta | Decisão possível |
|---|---|
| Quais modelos de checklist e itens já foram validados com usuários reais? | Importar como biblioteca padrão da U1 (RN-147) |
| O fluxo mobile (inclusive o app na Play Store) funciona bem no chão de fábrica? | Reaproveitar telas e interações na execução de checklist (RN-148) |
| O workflow multiagente do n8n (chat sobre BPF) é útil? | Virar o assistente de BPF do módulo (junto com o RAG da Fase 6, RN-180 a RN-183) |
| Há usuários e dados ativos? | Planejar a migração para a Rafanutri ou manter os dois produtos por um período |

O resultado vai para `docs/pesquisa/uan-discovery.md` e, se mudar a arquitetura, vira um ADR.

## 6. Modelo comercial do módulo

| Plano | Para quem | Referência de preço | Inclui |
|---|---|---|---|
| UAN Qualidade | Restaurantes e cozinhas pequenas | A definir (validar entre R$ 150 e R$ 400/mês por unidade) | U1: checklists, temperaturas, não conformidades, painel |
| UAN Completo | Cozinhas industriais, hospitais, escolas | R$ 500 a R$ 2.000+/mês por unidade | U1 a U5 |
| Consultoria | Nutricionista que atende vários estabelecimentos | Por estabelecimento atendido | U1 + documentos, com várias "unidades" de clientes diferentes |

O plano "Consultoria" atende a nutricionista autônoma que presta consultoria a restaurantes. É uma ponte natural entre o módulo clínico (plano gratuito) e a UAN. Os preços são hipóteses a validar nas entrevistas do RN-120.

## 7. Quando construir

A ordem atual é Fase 1B → Fase 2 → Fase 3 → Fases 4 e 5. As opções para a UAN:

| Cenário | Quando começar a UAN | Observação |
|---|---|---|
| Sem cliente UAN confirmado | Depois da Fase 3, como está no plano | Padrão |
| Cliente piloto confirmado | Logo após a Fase 1B, só com U0 + U1 (MVP do módulo) | Antecipa receita B2B; o restante segue a ordem normal |
| Usuários atuais do BPF Check | Em paralelo com a Fase 2, com 1 desenvolvedor dedicado ao módulo | Começar pela migração dos usuários do BPF Check |

## 8. Métricas do módulo

| Métrica | Meta inicial |
|---|---|
| Checklists executados no prazo | > 90% |
| Tempo entre leitura de temperatura fora da faixa e ação registrada | < 30 min |
| Não conformidades fechadas no prazo do plano de ação | > 80% |
| Unidades ativas por cliente | Crescer após o piloto |
| Fichas técnicas com custo atualizado nos últimos 30 dias (a partir da U2) | > 70% |
| Diferença entre compra prevista pelo cardápio e compra real (a partir da U3) | < 10% |

## 9. Riscos do módulo

| Risco | Mitigação |
|---|---|
| Normas locais diferentes por município | Biblioteca de checklists editável; levantamento das normas de cada piloto (RN-120) |
| Internet ruim na cozinha | Modo offline dos checklists com sincronização idempotente (RN-149) |
| Baixa adesão da equipe operacional | Checklists curtos, telas grandes e cobrança automática pelo WhatsApp |
| Registro "maquiado" (preenchido depois) | Data e hora do servidor, foto e geolocalização obrigatórias em itens críticos, trilha de auditoria (RN-167) |
| Escopo grande (209 pontos) | Entregas U0 a U7 independentes; vender a U1 antes de construir o resto |
| VPS gratuita com dados de empresas | Revisar a infraestrutura (ADR 0004) antes do primeiro contrato Enterprise, que é um dos gatilhos de revisão |
