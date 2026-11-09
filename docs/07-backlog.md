# 07 — Backlog

Índice consolidado de todos os itens. O detalhe de cada item (descrição, tarefas técnicas, critérios de aceite e testes) está no documento da fase, no link do ID.

Status: `todo`, `doing`, `done`, `adiado` (fora do MVP, ver [ADR 0004](adr/0004-infraestrutura-hospedagem.md)). Pontos: 1, 2, 3, 5, 8 (ver [plano/00-visao-geral.md](plano/00-visao-geral.md)).

## Resumo

| Fase | Documento | Itens | Pontos |
|---|---|---|---|
| 0 | [Fundação](plano/fase-0-fundacao.md) | 19 | 58 |
| 1 | [MVP Clínico](plano/fase-1-mvp-clinico.md) | 30 | 119 |
| 1B | [Plano gratuito e área do paciente](plano/fase-1b-freemium-area-paciente.md) | 16 | 50 |
| 2 | [Gestão do consultório](plano/fase-2-gestao.md) | 19 | 69 |
| 3 | [App do paciente + IA](plano/fase-3-app-paciente-ia.md) | 20 | 63 |
| 4 | [Materno-infantil](plano/fase-4-materno-infantil.md) | 20 | 65 |
| 5 | [UAN e Qualidade (Enterprise)](plano/fase-5-uan-qualidade.md) | 50 | 209 |
| 6 | [Saúde pública e avançados](plano/fase-6-saude-publica-avancados.md) | 30 | 134 |

## Fase 0 — Fundação

| ID | Item | Tipo | Pts | Depende de | Status |
|---|---|---|---|---|---|
| [RN-001](plano/fase-0-fundacao.md#rn-001--criar-monorepo-pnpm--turborepo) | Criar monorepo (pnpm + Turborepo) | infra | 3 | — | todo |
| [RN-002](plano/fase-0-fundacao.md#rn-002--configurar-nextjs-com-typescript-tailwind-e-shadcnui) | Configurar Next.js com TypeScript, Tailwind e shadcn/ui | infra | 2 | RN-001 | todo |
| [RN-003](plano/fase-0-fundacao.md#rn-003--configurar-supabase-local-e-na-vps) | Configurar Supabase local e na VPS | infra | 2 | RN-001 | todo |
| [RN-004](plano/fase-0-fundacao.md#rn-004--migração-organizações-perfis-membros-e-auditoria) | Migração: organizações, perfis, membros e auditoria | feature | 3 | RN-003 | todo |
| [RN-005](plano/fase-0-fundacao.md#rn-005--autenticação-e-mailsenha-google-e-recuperação-de-senha) | Autenticação: e-mail/senha, Google e recuperação de senha | feature | 3 | RN-002, RN-004 | todo |
| [RN-006](plano/fase-0-fundacao.md#rn-006--onboarding-criar-organização-no-primeiro-acesso) | Onboarding: criar organização no primeiro acesso | feature | 2 | RN-005 | todo |
| [RN-007](plano/fase-0-fundacao.md#rn-007--convite-de-membros-e-papéis) | Convite de membros e papéis | feature | 5 | RN-006 | todo |
| [RN-008](plano/fase-0-fundacao.md#rn-008--políticas-rls-base-e-testes-de-isolamento) | Políticas RLS base e testes de isolamento | infra | 5 | RN-004 | todo |
| [RN-009](plano/fase-0-fundacao.md#rn-009--gatilhos-de-auditoria-para-tabelas-sensíveis) | Gatilhos de auditoria para tabelas sensíveis | feature | 3 | RN-004 | todo |
| [RN-010](plano/fase-0-fundacao.md#rn-010--migração-da-base-de-alimentos) | Migração da base de alimentos | feature | 3 | RN-003 | todo |
| [RN-011](plano/fase-0-fundacao.md#rn-011--importação-da-taco) | Importação da TACO | feature | 5 | RN-010, RN-015 | todo |
| [RN-012](plano/fase-0-fundacao.md#rn-012--importação-da-tbca) | Importação da TBCA | feature | 5 | RN-010, RN-015 | todo |
| [RN-013](plano/fase-0-fundacao.md#rn-013--layout-base-do-painel) | Layout base do painel | feature | 3 | RN-002, RN-019 | todo |
| [RN-014](plano/fase-0-fundacao.md#rn-014--cicd) | CI/CD | infra | 3 | RN-001, RN-003 | todo |
| [RN-015](plano/fase-0-fundacao.md#rn-015--validações-regulatórias-e-de-licenças) | Validações regulatórias e de licenças | pesquisa | 2 | — | todo |
| [RN-016](plano/fase-0-fundacao.md#rn-016--termos-de-uso-política-de-privacidade-e-dpa) | Termos de Uso, Política de Privacidade e DPA | doc | 3 | RN-015 | adiado |
| [RN-017](plano/fase-0-fundacao.md#rn-017--observabilidade-e-tratamento-de-erros) | Observabilidade e tratamento de erros | infra | 2 | RN-002 | todo |
| [RN-018](plano/fase-0-fundacao.md#rn-018--gestão-de-segredos-e-variáveis-de-ambiente) | Gestão de segredos e variáveis de ambiente | infra | 1 | RN-003 | todo |
| [RN-019](plano/fase-0-fundacao.md#rn-019--identidade-visual-e-design-system-inicial) | Identidade visual e design system inicial | feature | 3 | RN-002 | todo |

## Fase 1 — MVP Clínico

| ID | Item | Tipo | Pts | Depende de | Status |
|---|---|---|---|---|---|
| [RN-020](plano/fase-1-mvp-clinico.md#rn-020--pacientes-cadastro-busca-e-filtros) | Pacientes: cadastro, busca e filtros | feature | 5 | RN-008, RN-013 | todo |
| [RN-021](plano/fase-1-mvp-clinico.md#rn-021--consentimento-lgpd-do-paciente) | Consentimento LGPD do paciente | feature | 3 | RN-016, RN-020 | adiado |
| [RN-022](plano/fase-1-mvp-clinico.md#rn-022--agenda) | Agenda | feature | 8 | RN-020 | todo |
| [RN-023](plano/fase-1-mvp-clinico.md#rn-023--prontuário-linha-do-tempo-e-evolução) | Prontuário: linha do tempo e evolução | feature | 5 | RN-020, RN-009 | todo |
| [RN-024](plano/fase-1-mvp-clinico.md#rn-024--anamnese-modelos-padrão) | Anamnese: modelos padrão | feature | 3 | RN-025 | todo |
| [RN-025](plano/fase-1-mvp-clinico.md#rn-025--editor-de-questionário-customizável) | Editor de questionário customizável | feature | 8 | RN-013 | todo |
| [RN-026](plano/fase-1-mvp-clinico.md#rn-026--link-público-de-anamnese) | Link público de anamnese | feature | 5 | RN-025 (RN-021 adiado: no MVP o formulário não exige consentimento) | todo |
| [RN-027](plano/fase-1-mvp-clinico.md#rn-027--nutrition-core-antropometria-e-composição-corporal) | `nutrition-core`: antropometria e composição corporal | feature | 5 | RN-001 | todo |
| [RN-028](plano/fase-1-mvp-clinico.md#rn-028--avaliação-antropométrica-e-gráficos-de-evolução) | Avaliação antropométrica e gráficos de evolução | feature | 5 | RN-027, RN-020 | todo |
| [RN-029](plano/fase-1-mvp-clinico.md#rn-029--nutrition-core-gasto-energético) | `nutrition-core`: gasto energético | feature | 3 | RN-001 | todo |
| [RN-030](plano/fase-1-mvp-clinico.md#rn-030--cálculo-energético-e-metas) | Cálculo energético e metas | feature | 3 | RN-029, RN-028 | todo |
| [RN-031](plano/fase-1-mvp-clinico.md#rn-031--editor-de-plano-alimentar) | Editor de plano alimentar | feature | 8 | RN-030, RN-010 | todo |
| [RN-032](plano/fase-1-mvp-clinico.md#rn-032--cálculo-em-tempo-real-de-nutrientes) | Cálculo em tempo real de nutrientes | feature | 5 | RN-031, RN-044 | todo |
| [RN-033](plano/fase-1-mvp-clinico.md#rn-033--medidas-caseiras) | Medidas caseiras | feature | 3 | RN-011 | todo |
| [RN-034](plano/fase-1-mvp-clinico.md#rn-034--substituições-por-equivalência) | Substituições por equivalência | feature | 5 | RN-032, RN-033 | todo |
| [RN-035](plano/fase-1-mvp-clinico.md#rn-035--modelos-de-plano-e-duplicação) | Modelos de plano e duplicação | feature | 3 | RN-031 | todo |
| [RN-036](plano/fase-1-mvp-clinico.md#rn-036--pdf-do-plano-alimentar) | PDF do plano alimentar | feature | 5 | RN-031, RN-034 | todo |
| [RN-037](plano/fase-1-mvp-clinico.md#rn-037--testes-e2e-do-fluxo-completo-de-consulta) | Testes e2e do fluxo completo de consulta | infra | 5 | RN-020 a RN-036 | todo |
| [RN-038](plano/fase-1-mvp-clinico.md#rn-038--seed-de-dados-sintéticos) | Seed de dados sintéticos | infra | 2 | RN-020, RN-031 | todo |
| [RN-039](plano/fase-1-mvp-clinico.md#rn-039--painel-inicial-do-nutricionista) | Painel inicial do nutricionista | feature | 3 | RN-022, RN-026 | todo |
| [RN-040](plano/fase-1-mvp-clinico.md#rn-040--ficha-resumo-do-paciente) | Ficha resumo do paciente | feature | 3 | RN-023, RN-028, RN-031 | todo |
| [RN-041](plano/fase-1-mvp-clinico.md#rn-041--alimentos-próprios-do-consultório) | Alimentos próprios do consultório | feature | 3 | RN-010 | todo |
| [RN-042](plano/fase-1-mvp-clinico.md#rn-042--preparações-do-consultório) | Preparações do consultório | feature | 3 | RN-041 | todo |
| [RN-043](plano/fase-1-mvp-clinico.md#rn-043--avaliação-do-consumo-alimentar-atual) | Avaliação do consumo alimentar atual | feature | 3 | RN-025, RN-032 | todo |
| [RN-044](plano/fase-1-mvp-clinico.md#rn-044--metas-de-micronutrientes-de-referência) | Metas de micronutrientes de referência | feature | 2 | RN-010 | todo |
| [RN-045](plano/fase-1-mvp-clinico.md#rn-045--orientações-e-textos-reutilizáveis) | Orientações e textos reutilizáveis | feature | 2 | RN-031 | todo |
| [RN-046](plano/fase-1-mvp-clinico.md#rn-046--envio-do-plano-e-comunicação-manual) | Envio do plano e comunicação manual | feature | 2 | RN-036 | todo |
| [RN-047](plano/fase-1-mvp-clinico.md#rn-047--programa-beta) | Programa beta | feature | 3 | RN-037 | todo |
| [RN-048](plano/fase-1-mvp-clinico.md#rn-048--revisão-de-desempenho-e-acessibilidade) | Revisão de desempenho e acessibilidade | infra | 3 | RN-031, RN-039 | todo |
| [RN-049](plano/fase-1-mvp-clinico.md#rn-049--endurecimento-de-segurança-antes-do-beta) | Endurecimento de segurança antes do beta | infra | 3 | RN-020 a RN-046 | todo |

## Fase 1B — Plano gratuito e área do paciente

| ID | Item | Tipo | Pts | Depende de | Status |
|---|---|---|---|---|---|
| [RN-200](plano/fase-1b-freemium-area-paciente.md#rn-200--planos-assinatura-e-plano-gratuito) | Planos, assinatura e plano gratuito | feature | 3 | RN-004 | todo |
| [RN-201](plano/fase-1b-freemium-area-paciente.md#rn-201--limite-de-20-pacientes-ativos-no-banco) | Limite de 20 pacientes ativos no banco | feature | 3 | RN-200, RN-020 | todo |
| [RN-202](plano/fase-1b-freemium-area-paciente.md#rn-202--uso-do-plano-e-aviso-de-limite-na-interface) | Uso do plano e aviso de limite na interface | feature | 2 | RN-201, RN-013 | todo |
| [RN-203](plano/fase-1b-freemium-area-paciente.md#rn-203--convite-do-paciente-e-vínculo-da-conta) | Convite do paciente e vínculo da conta | feature | 5 | RN-005, RN-020 | todo |
| [RN-204](plano/fase-1b-freemium-area-paciente.md#rn-204--área-do-paciente-autenticação-layout-e-início) | Área do paciente: autenticação, layout e início | feature | 5 | RN-203, RN-019 | todo |
| [RN-205](plano/fase-1b-freemium-area-paciente.md#rn-205--plano-alimentar-na-área-do-paciente) | Plano alimentar na área do paciente | feature | 3 | RN-204, RN-031, RN-034 | todo |
| [RN-206](plano/fase-1b-freemium-area-paciente.md#rn-206--biblioteca-de-receitas-compartilháveis) | Biblioteca de receitas compartilháveis | feature | 5 | RN-042 | todo |
| [RN-207](plano/fase-1b-freemium-area-paciente.md#rn-207--receitas-na-área-do-paciente) | Receitas na área do paciente | feature | 3 | RN-206, RN-204 | todo |
| [RN-208](plano/fase-1b-freemium-area-paciente.md#rn-208--recomendações-ao-paciente) | Recomendações ao paciente | feature | 5 | RN-045, RN-204 | todo |
| [RN-209](plano/fase-1b-freemium-area-paciente.md#rn-209--documentos-do-paciente) | Documentos do paciente | feature | 2 | RN-036, RN-204 | todo |
| [RN-210](plano/fase-1b-freemium-area-paciente.md#rn-210--o-que-o-paciente-vê-configurações-de-compartilhamento) | O que o paciente vê (configurações de compartilhamento) | feature | 2 | RN-205 | todo |
| [RN-211](plano/fase-1b-freemium-area-paciente.md#rn-211--paciente-com-mais-de-um-nutricionista) | Paciente com mais de um nutricionista | feature | 2 | RN-203, RN-204 | todo |
| [RN-212](plano/fase-1b-freemium-area-paciente.md#rn-212--avisos-por-e-mail-ao-paciente) | Avisos por e-mail ao paciente | feature | 2 | RN-205, RN-208 | todo |
| [RN-213](plano/fase-1b-freemium-area-paciente.md#rn-213--testes-de-isolamento-e-e2e-da-área-do-paciente) | Testes de isolamento e e2e da área do paciente | infra | 3 | RN-201 a RN-212 | todo |
| [RN-214](plano/fase-1b-freemium-area-paciente.md#rn-214--métricas-do-plano-gratuito) | Métricas do plano gratuito | feature | 2 | RN-202, RN-204 | todo |
| [RN-215](plano/fase-1b-freemium-area-paciente.md#rn-215--documentos-clínicos-com-a-marca) | Documentos clínicos com a marca | feature | 3 | RN-036, RN-209 | todo |

## Fase 2 — Gestão do consultório

| ID | Item | Tipo | Pts | Depende de | Status |
|---|---|---|---|---|---|
| [RN-050](plano/fase-2-gestao.md#rn-050--subir-n8n-self-hosted-e-conectar-ao-supabase) | Subir n8n (self-hosted) e conectar ao Supabase | infra | 3 | RN-003, RN-014 | todo |
| [RN-051](plano/fase-2-gestao.md#rn-051--lembrete-de-consulta-por-whatsapp-e-e-mail) | Lembrete de consulta por WhatsApp e e-mail | feature | 5 | RN-050, RN-059, RN-060, RN-063 | todo |
| [RN-052](plano/fase-2-gestao.md#rn-052--lembrete-de-retorno-e-envio-de-link-de-anamnese) | Lembrete de retorno e envio de link de anamnese | feature | 3 | RN-051, RN-026, RN-056 | todo |
| [RN-053](plano/fase-2-gestao.md#rn-053--financeiro-recebimentos-e-fluxo-de-caixa) | Financeiro: recebimentos e fluxo de caixa | feature | 5 | RN-008, RN-009 | todo |
| [RN-054](plano/fase-2-gestao.md#rn-054--pacotes-de-consultas) | Pacotes de consultas | feature | 3 | RN-053, RN-022 | todo |
| [RN-055](plano/fase-2-gestao.md#rn-055--recibo-em-pdf) | Recibo em PDF | feature | 2 | RN-053, RN-036 | todo |
| [RN-056](plano/fase-2-gestao.md#rn-056--crm-funil-e-retornos-atrasados) | CRM: funil e retornos atrasados | feature | 5 | RN-020, RN-022 | todo |
| [RN-057](plano/fase-2-gestao.md#rn-057--planos-pagos-do-saas-e-cobrança-recorrente) | Planos pagos do SaaS e cobrança recorrente | feature | 8 | RN-004, RN-062 | todo |
| [RN-058](plano/fase-2-gestao.md#rn-058--sincronização-com-google-calendar) | Sincronização com Google Calendar | feature | 5 | RN-022 | todo |
| [RN-059](plano/fase-2-gestao.md#rn-059--preferências-de-comunicação-e-opt-out-lgpd) | Preferências de comunicação e opt-out (LGPD) | feature | 3 | RN-021 | adiado |
| [RN-060](plano/fase-2-gestao.md#rn-060--log-de-mensagens-e-painel-de-entregas) | Log de mensagens e painel de entregas | feature | 3 | RN-050 | todo |
| [RN-061](plano/fase-2-gestao.md#rn-061--bloqueio-por-inadimplência-e-régua-de-cobrança) | Bloqueio por inadimplência e régua de cobrança | feature | 5 | RN-057, RN-062 | todo |
| [RN-062](plano/fase-2-gestao.md#rn-062--webhooks-do-gateway-com-idempotência) | Webhooks do gateway com idempotência | infra | 3 | RN-057 (pode ser desenvolvido em paralelo) | todo |
| [RN-063](plano/fase-2-gestao.md#rn-063--modelos-de-mensagem-e-aprovação-de-templates-whatsapp) | Modelos de mensagem e aprovação de templates WhatsApp | feature | 3 | RN-050 | todo |
| [RN-064](plano/fase-2-gestao.md#rn-064--painel-financeiro-e-indicadores-do-consultório) | Painel financeiro e indicadores do consultório | feature | 3 | RN-053, RN-054, RN-056 | todo |
| [RN-065](plano/fase-2-gestao.md#rn-065--configurações-de-automação-por-organização) | Configurações de automação por organização | feature | 2 | RN-051 | todo |
| [RN-066](plano/fase-2-gestao.md#rn-066--operação-do-n8n-monitoramento-backup-e-runbook) | Operação do n8n: monitoramento, backup e runbook | infra | 2 | RN-050 | todo |
| [RN-067](plano/fase-2-gestao.md#rn-067--documentação-da-fase-e-atualização-de-termos) | Documentação da fase e atualização de termos | doc | 1 | RN-057, RN-059 | todo |
| [RN-068](plano/fase-2-gestao.md#rn-068--página-pública-do-nutricionista-e-agendamento-online) | Página pública do nutricionista e agendamento online | feature | 5 | RN-022, RN-051 | todo |

## Fase 3 — App do paciente + IA

| ID | Item | Tipo | Pts | Depende de | Status |
|---|---|---|---|---|---|
| [RN-070](plano/fase-3-app-paciente-ia.md#rn-070--pwa-instalação-magic-link-layout-mobile) | PWA: instalação, magic link, layout mobile | feature | 2 | RN-005, RN-002 | todo |
| [RN-071](plano/fase-3-app-paciente-ia.md#rn-071--plano-do-dia-e-substituições-no-app) | Plano do dia e substituições no app | feature | 2 | RN-070, RN-086 | todo |
| [RN-072](plano/fase-3-app-paciente-ia.md#rn-072--lista-de-compras) | Lista de compras | feature | 3 | RN-071 | todo |
| [RN-073](plano/fase-3-app-paciente-ia.md#rn-073--diário-alimentar-e-hidratação) | Diário alimentar e hidratação | feature | 5 | RN-071, RN-078 | todo |
| [RN-074](plano/fase-3-app-paciente-ia.md#rn-074--notificações-push) | Notificações push | feature | 3 | RN-078, RN-050 | todo |
| [RN-075](plano/fase-3-app-paciente-ia.md#rn-075--sugestão-de-plano-alimentar-por-ia-alimentos-da-base-cálculo-pelo-nutrition-core) | Sugestão de plano alimentar por IA (alimentos da base, cálculo pelo `nutrition-core`) | feature | 8 | RN-081, RN-082, RN-083, RN-077, RN-087, RN-031 | todo |
| [RN-076](plano/fase-3-app-paciente-ia.md#rn-076--resumo-de-anamnese-e-histórico-por-ia) | Resumo de anamnese e histórico por IA | feature | 3 | RN-081, RN-082, RN-083, RN-077 | todo |
| [RN-077](plano/fase-3-app-paciente-ia.md#rn-077--registro-de-sugestões-e-limites-de-uso-por-plano) | Registro de sugestões e limites de uso por plano | feature | 3 | RN-057 | todo |
| [RN-078](plano/fase-3-app-paciente-ia.md#rn-078--manifest-service-worker-e-cache-offline) | Manifest, service worker e cache offline | infra | 3 | RN-070 | todo |
| [RN-079](plano/fase-3-app-paciente-ia.md#rn-079--marca-do-nutricionista-no-app) | Marca do nutricionista no app | feature | 2 | RN-078 | todo |
| [RN-080](plano/fase-3-app-paciente-ia.md#rn-080--painel-de-adesão-para-o-nutricionista) | Painel de adesão para o nutricionista | feature | 5 | RN-073 | todo |
| [RN-081](plano/fase-3-app-paciente-ia.md#rn-081--pseudonimização-antes-do-envio-ao-llm) | Pseudonimização antes do envio ao LLM | feature | 3 | RN-082 | adiado |
| [RN-082](plano/fase-3-app-paciente-ia.md#rn-082--camada-de-acesso-ao-llm-packagesai) | Camada de acesso ao LLM (`packages/ai`) | infra | 3 | RN-014 | todo |
| [RN-083](plano/fase-3-app-paciente-ia.md#rn-083--schemas-zod-de-saída-da-ia) | Schemas Zod de saída da IA | feature | 2 | RN-082 | todo |
| [RN-084](plano/fase-3-app-paciente-ia.md#rn-084--avaliação-de-qualidade-da-ia-com-casos-de-teste) | Avaliação de qualidade da IA com casos de teste | feature | 5 | RN-075, RN-076 | todo |
| [RN-085](plano/fase-3-app-paciente-ia.md#rn-085--monitoramento-de-custo-e-uso-de-ia) | Monitoramento de custo e uso de IA | infra | 2 | RN-077 | todo |
| [RN-086](plano/fase-3-app-paciente-ia.md#rn-086--convite-do-paciente-e-publicação-do-plano-para-o-app) | Convite do paciente e publicação do plano para o app | feature | 1 | RN-070, RN-035 | todo |
| [RN-087](plano/fase-3-app-paciente-ia.md#rn-087--restrições-e-preferências-alimentares-estruturadas) | Restrições e preferências alimentares estruturadas | feature | 3 | RN-024, RN-010 | todo |
| [RN-088](plano/fase-3-app-paciente-ia.md#rn-088--interface-de-revisão-da-sugestão-de-ia) | Interface de revisão da sugestão de IA | feature | 3 | RN-075 | todo |
| [RN-089](plano/fase-3-app-paciente-ia.md#rn-089--termos-de-ia-documentação-e-adrs-da-fase) | Termos de IA, documentação e ADRs da fase | doc | 2 | RN-082, RN-081 | todo |

## Fase 4 — Materno-infantil

| ID | Item | Tipo | Pts | Depende de | Status |
|---|---|---|---|---|---|
| [RN-100](plano/fase-4-materno-infantil.md#rn-100--obter-e-validar-as-tabelas-lms-da-oms) | Obter e validar as tabelas LMS da OMS | pesquisa | 2 | RN-015 | todo |
| [RN-101](plano/fase-4-materno-infantil.md#rn-101--migração-das-tabelas-pediátricas) | Migração das tabelas pediátricas | infra | 3 | RN-008, RN-020 | todo |
| [RN-102](plano/fase-4-materno-infantil.md#rn-102--importação-das-tabelas-lms) | Importação das tabelas LMS | infra | 3 | RN-100, RN-101 | todo |
| [RN-103](plano/fase-4-materno-infantil.md#rn-103--nutrition-core-escore-z-e-percentil-lms) | `nutrition-core`: escore-z e percentil LMS | feature | 5 | RN-100 | todo |
| [RN-104](plano/fase-4-materno-infantil.md#rn-104--nutrition-core-idade-e-idade-corrigida) | `nutrition-core`: idade e idade corrigida | feature | 2 | RN-103 | todo |
| [RN-105](plano/fase-4-materno-infantil.md#rn-105--nutrition-core-classificação-sisvanoms) | `nutrition-core`: classificação SISVAN/OMS | feature | 3 | RN-103 | todo |
| [RN-106](plano/fase-4-materno-infantil.md#rn-106--tela-de-registro-de-medida-pediátrica) | Tela de registro de medida pediátrica | feature | 5 | RN-101, RN-104, RN-105 | todo |
| [RN-107](plano/fase-4-materno-infantil.md#rn-107--gráficos-das-curvas-oms) | Gráficos das curvas OMS | feature | 5 | RN-102, RN-106 | todo |
| [RN-108](plano/fase-4-materno-infantil.md#rn-108--alertas-de-crescimento) | Alertas de crescimento | feature | 3 | RN-106 | todo |
| [RN-109](plano/fase-4-materno-infantil.md#rn-109--relatório-de-crescimento-em-pdf) | Relatório de crescimento em PDF | feature | 3 | RN-107, RN-036 | todo |
| [RN-110](plano/fase-4-materno-infantil.md#rn-110--migração-de-gestação-e-lactação) | Migração de gestação e lactação | infra | 2 | RN-101 | todo |
| [RN-111](plano/fase-4-materno-infantil.md#rn-111--nutrition-core-ganho-de-peso-gestacional) | `nutrition-core`: ganho de peso gestacional | feature | 5 | RN-110 | todo |
| [RN-112](plano/fase-4-materno-infantil.md#rn-112--tela-de-acompanhamento-da-gestante) | Tela de acompanhamento da gestante | feature | 5 | RN-111 | todo |
| [RN-113](plano/fase-4-materno-infantil.md#rn-113--adicional-energético-na-gestação-e-lactação) | Adicional energético na gestação e lactação | feature | 2 | RN-030, RN-111 | todo |
| [RN-114](plano/fase-4-materno-infantil.md#rn-114--registro-de-lactação) | Registro de lactação | feature | 2 | RN-110 | todo |
| [RN-115](plano/fase-4-materno-infantil.md#rn-115--conteúdos-de-introdução-alimentar) | Conteúdos de introdução alimentar | feature | 3 | RN-101 | todo |
| [RN-116](plano/fase-4-materno-infantil.md#rn-116--checklist-de-alergênicos-e-texturas) | Checklist de alergênicos e texturas | feature | 3 | RN-115 | todo |
| [RN-117](plano/fase-4-materno-infantil.md#rn-117--visão-do-responsável-no-app-do-paciente) | Visão do responsável no app do paciente | feature | 3 | RN-107, RN-116, RN-118 | todo |
| [RN-118](plano/fase-4-materno-infantil.md#rn-118--responsáveis-legais) | Responsáveis legais | feature | 3 | RN-101, RN-070 | todo |
| [RN-119](plano/fase-4-materno-infantil.md#rn-119--validação-clínica-e-testes-e2e-da-fase) | Validação clínica e testes e2e da fase | doc | 3 | RN-100 a RN-118 | todo |

## Fase 5 — UAN e Qualidade (Enterprise)

| ID | Item | Tipo | Pts | Depende de | Status |
|---|---|---|---|---|---|
| [RN-120](plano/fase-5-uan-qualidade.md#rn-120--descoberta-com-clientes-piloto) | Descoberta com clientes piloto | pesquisa | 3 | — | todo |
| [RN-121](plano/fase-5-uan-qualidade.md#rn-121--migração-de-unidades-e-papéis-enterprise) | Migração de unidades e papéis Enterprise | infra | 3 | RN-008 | todo |
| [RN-122](plano/fase-5-uan-qualidade.md#rn-122--rls-por-unidade-e-feature-flag-enterprise) | RLS por unidade e feature flag Enterprise | infra | 5 | RN-121 | todo |
| [RN-123](plano/fase-5-uan-qualidade.md#rn-123--tela-de-unidades-e-membros) | Tela de unidades e membros | feature | 3 | RN-122 | todo |
| [RN-124](plano/fase-5-uan-qualidade.md#rn-124--contrato-e-planos-enterprise-por-unidade) | Contrato e planos Enterprise por unidade | feature | 5 | RN-057, RN-121 | todo |
| [RN-125](plano/fase-5-uan-qualidade.md#rn-125--migração-de-insumos-unidades-e-fornecedores) | Migração de insumos, unidades e fornecedores | infra | 3 | RN-122 | todo |
| [RN-126](plano/fase-5-uan-qualidade.md#rn-126--cadastro-de-insumos) | Cadastro de insumos | feature | 5 | RN-125 | todo |
| [RN-127](plano/fase-5-uan-qualidade.md#rn-127--cadastro-de-fornecedores) | Cadastro de fornecedores | feature | 2 | RN-125 | todo |
| [RN-128](plano/fase-5-uan-qualidade.md#rn-128--histórico-de-preços-de-insumos) | Histórico de preços de insumos | feature | 3 | RN-126, RN-127 | todo |
| [RN-129](plano/fase-5-uan-qualidade.md#rn-129--migração-de-fichas-técnicas) | Migração de fichas técnicas | infra | 2 | RN-125 | todo |
| [RN-130](plano/fase-5-uan-qualidade.md#rn-130--nutrition-core-cálculos-da-ficha-técnica) | `nutrition-core`: cálculos da ficha técnica | feature | 5 | RN-125 | todo |
| [RN-131](plano/fase-5-uan-qualidade.md#rn-131--editor-da-ficha-técnica) | Editor da ficha técnica | feature | 8 | RN-126, RN-128, RN-129, RN-130 | todo |
| [RN-132](plano/fase-5-uan-qualidade.md#rn-132--informação-nutricional-da-ficha-técnica) | Informação nutricional da ficha técnica | feature | 3 | RN-131 | todo |
| [RN-133](plano/fase-5-uan-qualidade.md#rn-133--pdf-da-ficha-técnica) | PDF da ficha técnica | feature | 3 | RN-131, RN-036 | todo |
| [RN-134](plano/fase-5-uan-qualidade.md#rn-134--versão-e-aprovação-da-ficha-técnica) | Versão e aprovação da ficha técnica | feature | 3 | RN-131 | todo |
| [RN-135](plano/fase-5-uan-qualidade.md#rn-135--migração-de-cardápios-e-comensais) | Migração de cardápios e comensais | infra | 2 | RN-129 | todo |
| [RN-136](plano/fase-5-uan-qualidade.md#rn-136--editor-de-cardápio-cíclico) | Editor de cardápio cíclico | feature | 8 | RN-134, RN-135 | todo |
| [RN-137](plano/fase-5-uan-qualidade.md#rn-137--comensais-e-per-capita) | Comensais e per capita | feature | 3 | RN-135 | todo |
| [RN-138](plano/fase-5-uan-qualidade.md#rn-138--custo-e-análise-nutricional-do-cardápio) | Custo e análise nutricional do cardápio | feature | 5 | RN-132, RN-136, RN-137 | todo |
| [RN-139](plano/fase-5-uan-qualidade.md#rn-139--cálculo-da-necessidade-de-compras) | Cálculo da necessidade de compras | feature | 8 | RN-138, RN-143 | todo |
| [RN-140](plano/fase-5-uan-qualidade.md#rn-140--pedido-de-compra) | Pedido de compra | feature | 5 | RN-139 | todo |
| [RN-141](plano/fase-5-uan-qualidade.md#rn-141--recebimento-de-mercadorias) | Recebimento de mercadorias | feature | 5 | RN-140, RN-146 | todo |
| [RN-142](plano/fase-5-uan-qualidade.md#rn-142--migração-de-estoque) | Migração de estoque | infra | 2 | RN-125 | todo |
| [RN-143](plano/fase-5-uan-qualidade.md#rn-143--estoque-com-fefo) | Estoque com FEFO | feature | 5 | RN-142 | todo |
| [RN-144](plano/fase-5-uan-qualidade.md#rn-144--inventário-e-ajustes) | Inventário e ajustes | feature | 3 | RN-143 | todo |
| [RN-145](plano/fase-5-uan-qualidade.md#rn-145--alertas-de-validade-e-estoque-mínimo) | Alertas de validade e estoque mínimo | feature | 3 | RN-143, RN-050 | todo |
| [RN-146](plano/fase-5-uan-qualidade.md#rn-146--migração-de-checklists) | Migração de checklists | infra | 3 | RN-122 | todo |
| [RN-147](plano/fase-5-uan-qualidade.md#rn-147--editor-de-modelos-e-biblioteca-padrão) | Editor de modelos e biblioteca padrão | feature | 5 | RN-146 | todo |
| [RN-148](plano/fase-5-uan-qualidade.md#rn-148--execução-de-checklist-no-celular) | Execução de checklist no celular | feature | 8 | RN-147 | todo |
| [RN-149](plano/fase-5-uan-qualidade.md#rn-149--modo-offline-dos-checklists) | Modo offline dos checklists | feature | 8 | RN-148 | todo |
| [RN-150](plano/fase-5-uan-qualidade.md#rn-150--agenda-e-cobrança-de-checklists-pendentes) | Agenda e cobrança de checklists pendentes | feature | 3 | RN-147, RN-050 | todo |
| [RN-151](plano/fase-5-uan-qualidade.md#rn-151--equipamentos-e-registro-de-temperatura) | Equipamentos e registro de temperatura | feature | 5 | RN-146 | todo |
| [RN-152](plano/fase-5-uan-qualidade.md#rn-152--alertas-de-temperatura) | Alertas de temperatura | feature | 3 | RN-151, RN-050 | todo |
| [RN-153](plano/fase-5-uan-qualidade.md#rn-153--não-conformidades) | Não conformidades | feature | 5 | RN-148, RN-151 | todo |
| [RN-154](plano/fase-5-uan-qualidade.md#rn-154--plano-de-ação-5w2h) | Plano de ação 5W2H | feature | 3 | RN-153 | todo |
| [RN-155](plano/fase-5-uan-qualidade.md#rn-155--migração-de-documentos-e-treinamentos) | Migração de documentos e treinamentos | infra | 2 | RN-122 | todo |
| [RN-156](plano/fase-5-uan-qualidade.md#rn-156--modelos-dos-4-pops-obrigatórios) | Modelos dos 4 POPs obrigatórios | feature | 5 | RN-155 | todo |
| [RN-157](plano/fase-5-uan-qualidade.md#rn-157--manual-de-boas-práticas) | Manual de Boas Práticas | feature | 5 | RN-156 | todo |
| [RN-158](plano/fase-5-uan-qualidade.md#rn-158--aprovação-versão-e-ciência-de-documentos) | Aprovação, versão e ciência de documentos | feature | 3 | RN-155 | todo |
| [RN-159](plano/fase-5-uan-qualidade.md#rn-159--treinamentos-de-manipuladores) | Treinamentos de manipuladores | feature | 2 | RN-155 | todo |
| [RN-160](plano/fase-5-uan-qualidade.md#rn-160--appcc-fluxograma-e-análise-de-perigos) | APPCC: fluxograma e análise de perigos | feature | 5 | RN-131, RN-155 | todo |
| [RN-161](plano/fase-5-uan-qualidade.md#rn-161--appcc-pcc-limites-e-monitoramento) | APPCC: PCC, limites e monitoramento | feature | 5 | RN-160, RN-151 | todo |
| [RN-162](plano/fase-5-uan-qualidade.md#rn-162--rotulagem-cálculo-da-tabela-nutricional) | Rotulagem: cálculo da tabela nutricional | feature | 5 | RN-132 | todo |
| [RN-163](plano/fase-5-uan-qualidade.md#rn-163--rotulagem-alerta-frontal) | Rotulagem: alerta frontal | feature | 3 | RN-162 | todo |
| [RN-164](plano/fase-5-uan-qualidade.md#rn-164--rotulagem-geração-do-rótulo-e-alergênicos) | Rotulagem: geração do rótulo e alergênicos | feature | 3 | RN-162, RN-163 | todo |
| [RN-165](plano/fase-5-uan-qualidade.md#rn-165--painel-de-conformidade) | Painel de conformidade | feature | 5 | RN-150, RN-152, RN-153, RN-158 | todo |
| [RN-166](plano/fase-5-uan-qualidade.md#rn-166--relatórios-e-dossiê-para-fiscalização) | Relatórios e dossiê para fiscalização | feature | 5 | RN-165, RN-157, RN-161 | todo |
| [RN-167](plano/fase-5-uan-qualidade.md#rn-167--trilha-de-auditoria-e-integridade-dos-registros) | Trilha de auditoria e integridade dos registros | infra | 3 | RN-146, RN-151, RN-155 | todo |
| [RN-168](plano/fase-5-uan-qualidade.md#rn-168--testes-e2e-e-piloto) | Testes e2e e piloto | doc | 5 | RN-121 a RN-167 | todo |
| [RN-169](plano/fase-5-uan-qualidade.md#rn-169--onboarding-enterprise-e-importação-de-dados) | Onboarding Enterprise e importação de dados | feature | 5 | RN-126, RN-131 | todo |

## Fase 6 — Saúde pública e avançados

| ID | Item | Tipo | Pts | Depende de | Status |
|---|---|---|---|---|---|
| [RN-170](plano/fase-6-saude-publica-avancados.md#rn-170--base-de-triagens-nutricionais) | Base de triagens nutricionais | infra | 3 | RN-008, RN-020 | todo |
| [RN-171](plano/fase-6-saude-publica-avancados.md#rn-171--nrs-2002) | NRS-2002 | feature | 3 | RN-170 | todo |
| [RN-172](plano/fase-6-saude-publica-avancados.md#rn-172--mna-completa-e-mna-sf) | MNA completa e MNA-SF | feature | 5 | RN-170 | todo |
| [RN-173](plano/fase-6-saude-publica-avancados.md#rn-173--must) | MUST | feature | 2 | RN-170 | todo |
| [RN-174](plano/fase-6-saude-publica-avancados.md#rn-174--avaliação-subjetiva-global-e-triagem-em-campanha) | Avaliação Subjetiva Global e triagem em campanha | feature | 5 | RN-171, RN-172, RN-173 | todo |
| [RN-175](plano/fase-6-saude-publica-avancados.md#rn-175--migração-de-territórios-e-programas) | Migração de territórios e programas | infra | 3 | RN-170 | todo |
| [RN-176](plano/fase-6-saude-publica-avancados.md#rn-176--gestão-de-programas-e-grupos) | Gestão de programas e grupos | feature | 5 | RN-175 | todo |
| [RN-177](plano/fase-6-saude-publica-avancados.md#rn-177--indicadores-coletivos) | Indicadores coletivos | feature | 5 | RN-176 | todo |
| [RN-178](plano/fase-6-saude-publica-avancados.md#rn-178--relatórios-epidemiológicos-por-território) | Relatórios epidemiológicos por território | feature | 5 | RN-177 | todo |
| [RN-179](plano/fase-6-saude-publica-avancados.md#rn-179--estudo-de-exportação-sisvane-sus) | Estudo de exportação SISVAN/e-SUS | pesquisa | 3 | RN-178 | todo |
| [RN-180](plano/fase-6-saude-publica-avancados.md#rn-180--migração-da-base-de-conhecimento-pgvector) | Migração da base de conhecimento (pgvector) | infra | 3 | RN-075 | todo |
| [RN-181](plano/fase-6-saude-publica-avancados.md#rn-181--pipeline-de-ingestão-de-documentos) | Pipeline de ingestão de documentos | feature | 5 | RN-180 | todo |
| [RN-182](plano/fase-6-saude-publica-avancados.md#rn-182--assistente-rag-com-citações) | Assistente RAG com citações | feature | 8 | RN-181 | todo |
| [RN-183](plano/fase-6-saude-publica-avancados.md#rn-183--avaliação-de-qualidade-do-rag) | Avaliação de qualidade do RAG | infra | 3 | RN-182 | todo |
| [RN-184](plano/fase-6-saude-publica-avancados.md#rn-184--somatotipo-de-heath-carter) | Somatotipo de Heath-Carter | feature | 3 | RN-028 | todo |
| [RN-185](plano/fase-6-saude-publica-avancados.md#rn-185--catálogo-de-exames-e-valores-de-referência) | Catálogo de exames e valores de referência | infra | 3 | RN-008 | todo |
| [RN-186](plano/fase-6-saude-publica-avancados.md#rn-186--registro-e-evolução-de-exames) | Registro e evolução de exames | feature | 5 | RN-185 | todo |
| [RN-187](plano/fase-6-saude-publica-avancados.md#rn-187--suplementos-e-fitoterápicos) | Suplementos e fitoterápicos | feature | 5 | RN-031 | todo |
| [RN-188](plano/fase-6-saude-publica-avancados.md#rn-188--alertas-de-interação-droga-nutriente) | Alertas de interação droga-nutriente | feature | 5 | RN-187 | todo |
| [RN-189](plano/fase-6-saude-publica-avancados.md#rn-189--gerador-de-conteúdo-de-marketing) | Gerador de conteúdo de marketing | feature | 5 | RN-075, RN-077 | todo |
| [RN-190](plano/fase-6-saude-publica-avancados.md#rn-190--biblioteca-de-materiais-para-pacientes) | Biblioteca de materiais para pacientes | feature | 3 | RN-189, RN-071 | todo |
| [RN-191](plano/fase-6-saude-publica-avancados.md#rn-191--chat-modelo-de-dados-e-segurança) | Chat: modelo de dados e segurança | infra | 3 | RN-118 | todo |
| [RN-192](plano/fase-6-saude-publica-avancados.md#rn-192--chat-interface-web-e-app) | Chat: interface web e app | feature | 5 | RN-191 | todo |
| [RN-193](plano/fase-6-saude-publica-avancados.md#rn-193--app-nativo-base-expo) | App nativo: base Expo | infra | 5 | RN-070 | todo |
| [RN-194](plano/fase-6-saude-publica-avancados.md#rn-194--app-nativo-funcionalidades-e-publicação) | App nativo: funcionalidades e publicação | feature | 8 | RN-193, RN-192 | todo |
| [RN-195](plano/fase-6-saude-publica-avancados.md#rn-195--fhir-mapeamento-de-recursos) | FHIR: mapeamento de recursos | pesquisa | 3 | RN-023, RN-028 | todo |
| [RN-196](plano/fase-6-saude-publica-avancados.md#rn-196--fhir-exportação-e-importação) | FHIR: exportação e importação | feature | 8 | RN-195 | todo |
| [RN-197](plano/fase-6-saude-publica-avancados.md#rn-197--cobrança-de-pacientes-conta-e-gateway) | Cobrança de pacientes: conta e gateway | feature | 5 | RN-057, RN-053 | todo |
| [RN-198](plano/fase-6-saude-publica-avancados.md#rn-198--cobrança-de-pacientes-link-conciliação-e-recibo) | Cobrança de pacientes: link, conciliação e recibo | feature | 5 | RN-197, RN-055 | todo |
| [RN-199](plano/fase-6-saude-publica-avancados.md#rn-199--robustez-performance-observabilidade-e-carga) | Robustez: performance, observabilidade e carga | infra | 5 | — | todo |
