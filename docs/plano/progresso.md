# Progresso da implementação

Atualizado em **10/11/2026**. O que já está no código (`main`), o que está só em **demonstração** (interface completa, sem banco) e o que falta. Os IDs são os do [backlog](../07-backlog.md).

> **Situação geral (10/11/2026, noite):** o banco foi liberado. Cadastro, onboarding e consultório já gravam no Directus, com isolamento entre consultórios testado, e a TACO está no banco. O módulo clínico (pacientes, avaliação, plano alimentar) segue em **demonstração**, sem salvar.

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
| RN-003 Backend | 🟡 parcial | Directus 12.6.1 na vpsrafa com licença gratuita (Open Innovation Grant), migrações em `db/` e extensão em `directus/extensions/` ([runbook](../runbooks/directus-vpsrafa.md)); **sem backup diário ainda** |
| RN-004 Tabelas de organização | ✅ | Migração 0002: `organizations`, `organization_members`, `professional_profiles`, `plans`; slug único, gatilhos de último owner e limite de membros; testes em `db/tests/0002_organizations.test.sql`. Convites e auditoria ficam para RN-007/RN-009 |
| RN-005 Autenticação | ✅ login · ✅ cadastro | Login e logout reais; cadastro aberto com login automático. **Sem verificação por e-mail** (falta SMTP); recuperação de senha também depende de SMTP |
| RN-006 Onboarding | ✅ | Grava o consultório pelo endpoint `/rafanutri/organizations`; redireciona quem não tem consultório. Falta: upload do logo e seletor de consultório ([spec](../specs/cadastro-onboarding.md)) |
| RN-007 Convites e papéis | ⏳ | |
| RN-008 Isolamento entre organizações | 🟡 base | Permissões filtradas pela organização no papel Profissional + gatilhos no banco; 15 verificações em `db/tests/api-isolation.test.mjs`. Falta rodar no CI e estender a cada tabela nova |
| RN-010 e RN-011 Base de alimentos | 🟡 | TACO 4ª edição no banco (597 alimentos, 29 nutrientes) com busca sem acento ([db/README](../../db/README.md)) e já usada pelo editor de plano. Falta a página `/alimentos`. RN-012 (TBCA) pendente |
| RN-013 Layout | ✅ | Cabeçalho da área logada, tema claro e escuro, responsivo |
| RN-014 CI/CD | 🟡 parcial | GitHub Actions e Dockerfile ARM64; app no Coolify (`rafanutri-web`). Falta o webhook do GitHub para deploy automático ([runbook](../runbooks/deploy-web-coolify.md)) |
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
| RN-031 Editor de plano | 🧪 com TACO | Busca, substituições e plano de exemplo usam a **TACO do banco** (pela API do Directus, com o token do usuário); cai na base de exemplo se o Directus estiver fora. Paciente fictícia e plano ainda não salvos |
| RN-032 Cálculo em tempo real | 🧪 | Plano × metas com faixas de adequação |
| RN-033 Medidas caseiras | 🟡 | Medidas de 25 alimentos comuns da TACO no banco (migração 0003, **revisar com a nutricionista**); nos demais, a quantidade aparece em gramas |
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
| Dev | Servidor de e-mail (SMTP) para verificação de cadastro e recuperação de senha |
| Dev | Backup diário do banco (bloqueado pelo controle de permissões), UptimeRobot, webhook do GitHub, fechar a porta 8010 |
| Nenhum | Página `/alimentos`; ampliar as medidas caseiras (RN-033) com a nutricionista |
| Nenhum | Fase 1 com banco: pacientes (RN-020) com o limite de 20 do plano gratuito, avaliação e plano alimentar salvos |
