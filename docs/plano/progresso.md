# Progresso da implementação

Atualizado em **10/11/2026**. O que já está no código (`main`), o que está só em **demonstração** (interface completa, sem banco) e o que falta. Os IDs são os do [backlog](../07-backlog.md).

> **Situação geral:** a interface do MVP está avançando **sem banco**. Por decisão do dev, o Directus da vpsrafa ainda não recebe tabelas nem dados ("não mexer em nada do banco agora"). Por isso, cadastro, onboarding e o módulo clínico funcionam de ponta a ponta na tela, mas **nada é salvo**.

## Legenda

| Situação | Significado |
|---|---|
| ✅ Feito | Implementado e testado; funciona de verdade |
| 🧪 Demonstração | Interface e cálculos prontos, com dados de exemplo; falta o banco para salvar |
| 🔒 Pronto, desligado | Código pronto atrás de uma chave (`SIGNUP_OPEN`), aguardando o banco |
| ⏳ Pendente | Ainda não começou |

## Fase 0 — Fundação

| Item | Situação | Observação |
|---|---|---|
| RN-001 Monorepo | ✅ | pnpm + Turborepo, `apps/web`, `packages/nutrition-core`, `packages/config` |
| RN-002 App web | ✅ | Next.js 16, React 19, Tailwind 4, shadcn/ui, TypeScript estrito |
| RN-003 Backend | 🟡 parcial | Directus 12.6.1 instalado na vpsrafa ([runbook](../runbooks/directus-vpsrafa.md)); sem tabelas, sem backup ainda |
| RN-004 Tabelas de organização | ⏳ | Aguardando liberação do banco |
| RN-005 Autenticação | ✅ login · 🔒 cadastro | Login e logout reais no Directus (cookies `httpOnly`, renovação no `proxy.ts`). Cadastro pronto e desligado |
| RN-006 Onboarding | 🔒 | Assistente de 4 etapas com pré-visualização da marca ([spec](../specs/cadastro-onboarding.md)) |
| RN-007 Convites e papéis | ⏳ | |
| RN-008 Isolamento entre organizações | ⏳ | Permissões do Directus + ganchos + gatilhos ([ADR 0008](../adr/0008-backend-directus.md)) |
| RN-010 a RN-012 Base de alimentos | ⏳ | Hoje existe só uma base **de exemplo** (29 alimentos, valores aproximados) |
| RN-013 Layout | ✅ | Cabeçalho da área logada, tema claro e escuro, responsivo |
| RN-014 CI/CD | 🟡 parcial | GitHub Actions (lint, typecheck, testes, build, e2e) e Dockerfile ARM64 prontos; **aplicação no Coolify ainda não criada** ([runbook](../runbooks/deploy-web-coolify.md)) |
| RN-019 Identidade visual | ✅ | Paleta, tipografia, logo provisório, ilustrações vetoriais próprias |

## Fase 1 — MVP Clínico

| Item | Situação | Observação |
|---|---|---|
| RN-020 Pacientes | 🧪 | Lista com busca, filtro por status e contador do plano gratuito |
| RN-023 Prontuário (linha do tempo) | 🧪 | Ficha resumo da paciente de exemplo |
| RN-027 Antropometria e composição corporal | ✅ cálculo · 🧪 tela | `nutrition-core`: IMC, Jackson & Pollock 3/7, Durnin, Faulkner, ISAK, Siri/Brozek |
| RN-028 Avaliação e gráficos | 🧪 | Cálculo ao vivo e evolução de peso e % de gordura |
| RN-029 Gasto energético | ✅ cálculo · 🧪 tela | Harris-Benedict, Mifflin-St Jeor, Cunningham, FAO/OMS |
| RN-030 Metas | 🧪 | No painel do editor: fórmula, fator de atividade, ajuste, proteína em g/kg e lipídios em % |
| RN-031 Editor de plano | 🧪 | Refeições, busca, medidas caseiras, modo qualitativo |
| RN-032 Cálculo em tempo real | 🧪 | Plano × metas com faixas de adequação |
| RN-033 Medidas caseiras | 🧪 | Com plural correto em português |
| RN-034 Substituições | 🧪 | Equivalência em energia no mesmo grupo, já em medida caseira |
| RN-036 PDF do plano | 🧪 | PDF com a marca, gerado no navegador ([spec](../specs/modulo-clinico-demo.md)) |
| RN-022 Agenda, RN-025/026 Anamnese, RN-035 Modelos, RN-041/042 Alimentos e preparações próprios | ⏳ | |

## Fase 1B — Plano gratuito e área do paciente

| Item | Situação | Observação |
|---|---|---|
| RN-200 a RN-202 Plano gratuito e limite | 🧪 | Tela principal com os módulos por plano ([spec](../specs/tela-principal-modulos.md)); hoje todo usuário é tratado como plano gratuito |
| RN-203 a RN-215 Área do paciente | ⏳ | |

## Página pública e marketing

| Item | Situação |
|---|---|
| Página inicial (hero, áreas de atuação, recursos, editor, IA, benefícios, princípios, planos, perguntas frequentes) | ✅ |
| Termos e Privacidade | Páginas provisórias ("em elaboração") |

## Qualidade

| Verificação | Resultado em 10/11/2026 |
|---|---|
| Testes do app web (Vitest + Testing Library) | 95 passando |
| Testes do `nutrition-core` | 41 passando |
| Testes de ponta a ponta (Playwright, computador e celular) | 16 passando; 2 pulados (login real, exige usuário de teste) |
| Lint e typecheck | Sem erros nem avisos |

## Próximos passos

| Depende de | Passo |
|---|---|
| Dev | Criar a aplicação no Coolify (ou liberar a permissão para fazer pelo terminal) |
| Dev | Pendências da vpsrafa: senha do admin do Directus, backup diário, UptimeRobot, fechar a porta 8010 |
| Dev | Liberar o banco para a Fase 0 no Directus: tabelas, permissões, importação da TACO e `SIGNUP_OPEN=true` |
| Nenhum (sem banco) | Agenda, anamnese por link e área do paciente com dados de exemplo |
