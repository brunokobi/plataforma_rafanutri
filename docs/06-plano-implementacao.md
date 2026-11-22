# 06 — Plano de implementação

> Este é o resumo executivo, escrito antes da implementação. O que mudou no caminho: backend **Directus** no lugar do Supabase ([ADR 0008](adr/0008-backend-directus.md)); avisos por **Telegram e e-mail** dentro da extensão, sem n8n nem WhatsApp automático; assinatura por **Pix** com confirmação do admin, sem gateway; área do paciente **web responsiva** em `/p`, sem PWA; IA com modelos gratuitos do OpenRouter, sem RAG. Situação real em [plano/progresso.md](plano/progresso.md).
>
> O plano detalhado, com modelo de dados, telas, tarefas técnicas, critérios de aceite e testes de cada item, está em [plano/00-visao-geral.md](plano/00-visao-geral.md) e nos documentos de cada fase.

## Estratégia

1. **Fundação** sólida (multi-tenant, segurança, base de alimentos) para não refazer depois.
2. **MVP Clínico** que já resolve a consulta de ponta a ponta e pode ser vendido.
3. **Gestão + automações** para reduzir churn e aumentar o valor percebido.
4. **App do paciente + IA** como diferencial e mecanismo de retenção.
5. **Materno-infantil**, **UAN Enterprise** e **Saúde pública** como expansão.

Estimativas consideram **1 a 2 desenvolvedores full-stack** e são referência para planejamento, não compromisso. Revisar ao fim de cada fase.

## Visão geral das fases

| Fase | Nome | Duração estimada | Resultado (situação em 22/11/2026) |
|---|---|---|---|
| 0 | Fundação | 3 semanas | Projeto rodando com login, organizações, isolamento por organização, CI e base TACO importada (feito) |
| 1 | MVP Clínico | 8 semanas | Nutricionista atende um paciente do cadastro ao plano alimentar em PDF (feito) |
| 1B | Plano gratuito e área do paciente | 3 semanas | Até 20 pacientes grátis por nutricionista; paciente vê plano, receitas e recomendações (feito) |
| 2 | Gestão do consultório | 4 semanas | Avisos por Telegram e e-mail, financeiro, CRM e assinatura por Pix (feito; Google Calendar e gateway pendentes) |
| 3 | App do paciente + IA | 6 semanas | Área do paciente web e assistente de IA (feito; diário, hidratação e chat pendentes) |
| 4 | Materno-infantil | 4 semanas | Curvas OMS, gestantes, lactação, introdução alimentar, responsáveis (feito) |
| 5 | UAN e Qualidade (Enterprise) | 10 semanas | Ficha técnica, cardápio cíclico, compras, estoque, checklists BPF, APPCC, rotulagem (em boa parte feito) |
| 6 | Saúde pública e avançados | contínuo | Triagens (bloco A feito: NRS-2002, MUST e ASG), programas, integrações |

Marco comercial: **beta com plano gratuito ao fim da Fase 1B** com 5 a 10 nutricionistas; **lançamento pago ao fim da Fase 2**.

---

## Fase 0 — Fundação (3 semanas)

**Objetivo:** base técnica, de segurança e de dados pronta para construir os módulos.

Entregas:
- Monorepo (pnpm + Turborepo) com `apps/web`, `packages/nutrition-core`, `packages/forms`, `db/` e `directus/extensions/`.
- Directus na VPS (sem staging); migrações SQL versionadas em `db/migrations`.
- Autenticação (e-mail/senha, Google), criação de organização no primeiro acesso, convite de membros, papéis.
- Permissões do Directus por organização, ganchos e gatilhos, com teste automatizado de isolamento pela API.
- `audit_logs` com gatilhos nas tabelas sensíveis.
- Importação da TACO para `foods`/`food_nutrients` (depois vieram IBGE, Open Food Facts e USDA; a TBCA ficou fora por licença).
- Layout base do painel (navegação, tema, componentes) e identidade visual inicial.
- CI no GitHub Actions: lint, typecheck, testes, build e e2e; deploy manual na VPS existente via Coolify, sem staging (ver ADR 0004).
- Validação regulatória e de licenças (itens "A validar" de [05-seguranca-lgpd.md](05-seguranca-lgpd.md)).

**Pronto quando:** um usuário cria conta, cria sua organização, convida um assistente, e o teste automatizado prova que outra organização não acessa seus dados.

## Fase 1 — MVP Clínico (8 semanas)

**Objetivo:** atender uma consulta completa dentro da plataforma.

| Semana | Entregas |
|---|---|
| 1–2 | Pacientes (CRUD, busca, consentimento LGPD), agenda (dia/semana, status, primeira consulta/retorno), prontuário com linha do tempo |
| 3 | Anamnese: modelos padrão, editor de questionário, link público para o paciente responder, revisão pelo nutricionista |
| 4 | Antropometria e composição corporal: protocolos de dobras, circunferências, IMC, gráficos de evolução |
| 5–6 | Gasto energético e prescrição: fórmulas de GET, metas de macro, editor de plano por refeição, cálculo em tempo real de calorias/macros/micros, medidas caseiras |
| 7 | Substituições por equivalência, modelos de plano reutilizáveis, duplicar plano |
| 8 | PDF do plano alimentar com a marca do profissional, ajustes do beta, testes e2e do fluxo completo |

**Pronto quando:** em menos de 10 minutos um nutricionista cadastra o paciente, registra a avaliação, calcula o GET, monta o plano e gera o PDF; testes de cálculo no `nutrition-core` validados contra exemplos de referência.

## Fase 1B — Plano gratuito e área do paciente (3 semanas)

- Plano `free` permanente: até 20 pacientes ativos por nutricionista, limite aplicado no banco.
- Convite do paciente, login por link mágico e área do paciente com a marca do nutricionista.
- Paciente vê o plano publicado, receitas (enviadas e as do plano), recomendações e PDFs.
- Detalhes em [plano/fase-1b-freemium-area-paciente.md](plano/fase-1b-freemium-area-paciente.md).

## Fase 2 — Gestão do consultório (4 semanas)

- Motor de avisos dentro da extensão do Directus (sem n8n): lembretes de consulta por Telegram e e-mail; lembrete de retorno e envio do link de anamnese pendentes.
- Financeiro: registro de recebimentos, pacotes de consultas, fluxo de caixa mensal, recibo em PDF.
- CRM: funil de pacientes e lista de retornos atrasados.
- Assinatura do SaaS: planos pagos por Pix com confirmação do admin, renovação mensal e volta ao Gratuito sem pagamento (gateway com baixa automática fica para depois).
- Integração opcional com Google Calendar.

**Pronto quando:** a plataforma cobra a assinatura sozinha e o paciente recebe lembrete automático sem ação manual do nutricionista.

## Fase 3 — App do paciente + IA (6 semanas)

App do paciente (planejado como PWA, ver [ADR 0003](adr/0003-app-paciente-pwa.md); entregue como web responsiva em `/p`, sem PWA):
- Acesso por magic link, plano do dia, substituições, lista de compras.
- Diário alimentar (marcar refeições), meta de hidratação, notificações push.
- Personalização com a marca do nutricionista.

IA:
- Sugestão de plano alimentar a partir de GET, metas, restrições e preferências, usando apenas alimentos da base (o cálculo final é sempre do `nutrition-core`, não do LLM).
- Resumo automático da anamnese e do histórico.
- Limites de uso por plano (`ai_requests`, migração 0063: só tipo, modelo e tokens; nenhum texto gravado). Entregue com modelos gratuitos do OpenRouter, sem dados que identifiquem o paciente.

**Pronto quando:** pacientes do beta usam o app ao menos 3 vezes por semana e o tempo de montagem de plano cai com a sugestão da IA.

## Fase 4 — Materno-infantil (4 semanas)

- Importação das tabelas LMS dos padrões de crescimento da OMS (0–5 anos e 5–19 anos).
- Cálculo de escore-z e percentil; gráficos com as curvas e alertas de desvio.
- Acompanhamento de gestantes: ganho de peso por IMC pré-gestacional.
- Conteúdos de introdução alimentar (P2 pode ficar para depois).

## Fase 5 — UAN e Qualidade, versão Enterprise (10 semanas)

| Bloco | Entregas |
|---|---|
| Estrutura | Unidades produtoras, usuários por unidade, papéis (nutricionista RT, cozinheiro, estoquista) |
| Ficha técnica | Ingredientes, peso bruto/líquido, FC, IC, rendimento, porção, custo por porção, informação nutricional |
| Cardápio | Cardápio cíclico, número de comensais, per capita, custo por refeição |
| Compras | Necessidade de insumos a partir do cardápio, pedido de compra, cadastro de fornecedores |
| Qualidade | Checklists configuráveis (temperatura, recebimento, higiene) usáveis no celular com foto e assinatura; não conformidades e plano de ação; painel de conformidade por unidade |
| Documentos | POPs e Manual de Boas Práticas com versão e aprovação (pode ir para fase seguinte) |

**Pronto quando:** um cliente piloto Enterprise opera uma unidade inteira (cardápio → compras → checklists diários) sem planilha.

## Fase 6 — Saúde pública e avançados (contínuo)

- Triagens NRS-2002, MUST e ASG (feitas, migração 0066); MNA aguardando a licença.
- Programas e grupos populacionais com indicadores coletivos.
- Assistente sobre diretrizes com fontes citadas (sem RAG por enquanto).
- Estoque completo, APPCC, rotulagem nutricional.
- App nativo (Expo) se as métricas da área do paciente pedirem.
- Integrações com prontuários (FHIR).

---

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Erro em cálculo nutricional | Alto (saúde e credibilidade) | Fórmulas isoladas no `nutrition-core`, testes com casos de referência, validação pela nutricionista |
| Vazamento de dado sensível | Alto (LGPD) | Isolamento testado pela API, auditoria, arquivos servidos só a quem pode ver, IA sem dados que identifiquem o paciente |
| Licença das bases de alimentos | Médio | Validar na Fase 0; permitir base própria como alternativa |
| Escopo grande demais | Alto | Fases com critério de pronto; P2 só entra com evidência de demanda |
| Custo de IA | Médio | Só modelos gratuitos do OpenRouter e cota diária por plano |
| Concorrentes estabelecidos (Dietbox, WebDiet) | Médio | Diferencial em IA, app do paciente e módulo UAN no mesmo produto |

## Cadência de trabalho

- Ciclos de 2 semanas com demonstração para a nutricionista parceira.
- Backlog em [07-backlog.md](07-backlog.md), atualizado ao fim de cada ciclo.
- Decisões de arquitetura registradas em `docs/adr/`.
