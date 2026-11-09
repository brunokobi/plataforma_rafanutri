# 06 — Plano de implementação

> Este é o resumo executivo. O plano detalhado, com modelo de dados, telas, tarefas técnicas, critérios de aceite e testes de cada item, está em [plano/00-visao-geral.md](plano/00-visao-geral.md) e nos documentos de cada fase.

## Estratégia

1. **Fundação** sólida (multi-tenant, segurança, base de alimentos) para não refazer depois.
2. **MVP Clínico** que já resolve a consulta de ponta a ponta e pode ser vendido.
3. **Gestão + automações** para reduzir churn e aumentar o valor percebido.
4. **App do paciente + IA** como diferencial e mecanismo de retenção.
5. **Materno-infantil**, **UAN Enterprise** e **Saúde pública** como expansão.

Estimativas consideram **1 a 2 desenvolvedores full-stack** e são referência para planejamento, não compromisso. Revisar ao fim de cada fase.

## Visão geral das fases

| Fase | Nome | Duração estimada | Resultado |
|---|---|---|---|
| 0 | Fundação | 3 semanas | Projeto rodando com login, organizações, RLS, CI e base TACO importada |
| 1 | MVP Clínico | 8 semanas | Nutricionista atende um paciente do cadastro ao plano alimentar em PDF |
| 2 | Gestão do consultório | 4 semanas | Lembretes por WhatsApp, financeiro, CRM e assinatura do SaaS |
| 3 | App do paciente + IA | 6 semanas | PWA do paciente e sugestões de cardápio por IA |
| 4 | Materno-infantil | 4 semanas | Curvas OMS, gestantes |
| 5 | UAN e Qualidade (Enterprise) | 10 semanas | Ficha técnica, cardápio cíclico, compras, checklists BPF |
| 6 | Saúde pública e avançados | contínuo | Triagens, programas, RAG, integrações |

Marco comercial: **beta fechado ao fim da Fase 1** com 5 a 10 nutricionistas; **lançamento pago ao fim da Fase 2**.

---

## Fase 0 — Fundação (3 semanas)

**Objetivo:** base técnica, de segurança e de dados pronta para construir os módulos.

Entregas:
- Monorepo (pnpm + Turborepo) com `apps/web`, `packages/nutrition-core`, `packages/db`, `packages/ui`, `supabase/`.
- Supabase local e projeto de staging; migrações versionadas.
- Autenticação (e-mail/senha, Google), criação de organização no primeiro acesso, convite de membros, papéis.
- Políticas RLS e testes automatizados de isolamento entre organizações.
- `audit_logs` com gatilhos nas tabelas sensíveis.
- Importação da TACO (e TBCA, se a licença permitir) para `foods`/`food_nutrients`.
- Layout base do painel (navegação, tema, componentes) e identidade visual inicial.
- CI no GitHub Actions: lint, typecheck, testes, build; deploy de preview na Vercel.
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

## Fase 2 — Gestão do consultório (4 semanas)

- n8n configurado (self-hosted) e conectado ao Supabase por webhooks.
- Lembretes de consulta e retorno por WhatsApp e e-mail; envio do link de anamnese.
- Financeiro: registro de recebimentos, pacotes de consultas, fluxo de caixa mensal, recibo em PDF.
- CRM: funil de pacientes e lista de retornos atrasados.
- Assinatura do SaaS: planos, trial, cobrança recorrente via gateway, bloqueio por inadimplência.
- Integração opcional com Google Calendar.

**Pronto quando:** a plataforma cobra a assinatura sozinha e o paciente recebe lembrete automático sem ação manual do nutricionista.

## Fase 3 — App do paciente + IA (6 semanas)

App do paciente (PWA, ver [ADR 0003](adr/0003-app-paciente-pwa.md)):
- Acesso por magic link, plano do dia, substituições, lista de compras.
- Diário alimentar (marcar refeições), meta de hidratação, notificações push.
- Personalização com a marca do nutricionista.

IA:
- Sugestão de plano alimentar a partir de GET, metas, restrições e preferências, usando apenas alimentos da base (o cálculo final é sempre do `nutrition-core`, não do LLM).
- Resumo automático da anamnese e do histórico.
- Registro de aceite/edição em `ai_suggestions` e limites de uso por plano.

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

- Triagens NRS-2002, MNA e MUST.
- Programas e grupos populacionais com indicadores coletivos.
- Assistente RAG sobre diretrizes (base de conhecimento com fontes citadas).
- Estoque completo, APPCC, rotulagem nutricional.
- App nativo (Expo) se as métricas do PWA pedirem.
- Integrações com prontuários (FHIR).

---

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Erro em cálculo nutricional | Alto (saúde e credibilidade) | Fórmulas isoladas no `nutrition-core`, testes com casos de referência, validação pela nutricionista |
| Vazamento de dado sensível | Alto (LGPD) | RLS testada, auditoria, buckets privados, pseudonimização na IA |
| Licença das bases de alimentos | Médio | Validar na Fase 0; permitir base própria como alternativa |
| Escopo grande demais | Alto | Fases com critério de pronto; P2 só entra com evidência de demanda |
| Custo de IA | Médio | Limites por plano, cache, modelos menores para tarefas simples |
| Concorrentes estabelecidos (Dietbox, WebDiet) | Médio | Diferencial em IA, app do paciente e módulo UAN no mesmo produto |

## Cadência de trabalho

- Ciclos de 2 semanas com demonstração para a nutricionista parceira.
- Backlog em [07-backlog.md](07-backlog.md), atualizado ao fim de cada ciclo.
- Decisões de arquitetura registradas em `docs/adr/`.
