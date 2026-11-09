# Rafanutri

**A plataforma de trabalho do nutricionista, do consultório à cozinha industrial.**

A Rafanutri reúne as áreas da nutrição em um só lugar: atendimento clínico e esportivo, nutrição materno-infantil, saúde pública, Unidades de Alimentação e Nutrição (UAN) com gestão de qualidade, e gestão do negócio do nutricionista. Também traz assistentes de IA e um app para o paciente acompanhar o plano alimentar.

> **Status:** concepção e planejamento. O repositório contém a documentação do produto e o plano de implementação. O desenvolvimento começa na [Fase 0 — Fundação](docs/plano/fase-0-fundacao.md).

---

## Sumário

- [Por que a Rafanutri](#por-que-a-rafanutri)
- [Módulos](#módulos)
- [Estratégia de lançamento](#estratégia-de-lançamento)
- [Roadmap](#roadmap)
- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Como rodar localmente](#como-rodar-localmente)
- [Scripts](#scripts)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Fluxo de contribuição](#fluxo-de-contribuição)
- [Segurança e LGPD](#segurança-e-lgpd)
- [Documentação](#documentação)

---

## Por que a Rafanutri

> **MVP:** tudo roda na VPS existente, com WhatsApp pela Evolution API e IA pelo OpenRouter. A adequação à LGPD fica para depois do MVP ([ADR 0004](docs/adr/0004-infraestrutura-hospedagem.md)).

- **Nutricionistas** usam várias ferramentas soltas: uma para calcular dieta, outra para agenda, WhatsApp para falar com o paciente e planilha para o financeiro. A Rafanutri junta tudo e usa IA para reduzir o tempo de montar um plano alimentar para **menos de 10 minutos**.
- **Pacientes** recebem o plano no celular, com substituições, lista de compras e metas de hidratação.
- **Empresas de alimentação** substituem papel e planilha por checklists digitais, fichas técnicas com custo e documentação de Boas Práticas pronta para a fiscalização (RDC 216/2004).

## Módulos

| Módulo | Para quem | Destaques |
|---|---|---|
| **Núcleo** | Todos | Contas e equipes, pacientes, agenda, prontuário, base de alimentos (TACO/TBCA), PDFs com a marca do profissional |
| **1. Clínico e Esportivo** | Nutricionistas de consultório, academias, estética | Anamnese por link, antropometria e composição corporal, gasto energético, plano alimentar com cálculo em tempo real e substituições |
| **2. Materno-Infantil** | Nutrição pediátrica e gestantes | Curvas de crescimento da OMS com escore-z, ganho de peso gestacional, introdução alimentar |
| **3. Saúde Pública** | UBS, ambulatórios, programas | Triagens (NRS-2002, MNA, MUST), grupos populacionais, relatórios |
| **4. UAN e Qualidade** | Restaurantes, hospitais, escolas, hotéis | Ficha técnica, cardápio cíclico, compras, estoque, checklists BPF, POPs, APPCC, rotulagem |
| **5. Gestão do consultório** | Profissionais e clínicas | Lembretes por WhatsApp, CRM, financeiro, pacotes, conteúdo de marketing |
| **IA** | Nutricionista | Sugestão de plano, resumo de anamnese, assistente sobre diretrizes (sempre revisado pelo profissional) |
| **Área do paciente** | Paciente | Plano alimentar, receitas, recomendações e PDFs (MVP); depois diário, hidratação, lista de compras e chat |

Detalhes e prioridades em [docs/02-modulos.md](docs/02-modulos.md).

## Estratégia de lançamento

1. **Plano gratuito** com até 20 pacientes ativos por nutricionista para atrair usuários no MVP.
2. **Clínico + Gestão** como base dos planos pagos: assinatura mensal por nutricionista (referência de R$ 79 a R$ 190/mês), mercado grande e venda rápida.
3. **Área do paciente** como mecanismo de retenção: quando os pacientes usam o app, trocar de sistema fica caro para o profissional.
4. **UAN/Qualidade Enterprise** em seguida: contratos B2B por unidade produtora (referência de R$ 500 a R$ 2.000+/mês).

Ver [docs/01-visao-produto.md](docs/01-visao-produto.md).

## Roadmap

| Fase | Entrega | Duração estimada* | Marco |
|---|---|---|---|
| 0 | [Fundação](docs/plano/fase-0-fundacao.md): monorepo, auth, organizações, RLS, TACO, CI/CD | 3 semanas | Base pronta |
| 1 | [MVP Clínico](docs/plano/fase-1-mvp-clinico.md): pacientes, agenda, anamnese, avaliação, plano alimentar, PDF | 8 semanas | |
| 1B | [Plano gratuito e área do paciente](docs/plano/fase-1b-freemium-area-paciente.md): até 20 pacientes grátis; paciente vê plano, receitas e recomendações | 3 semanas | **Beta com plano gratuito** |
| 2 | [Gestão](docs/plano/fase-2-gestao.md): WhatsApp, financeiro, CRM, assinatura do SaaS | 4 semanas | **Lançamento pago** |
| 3 | [App do paciente + IA](docs/plano/fase-3-app-paciente-ia.md) | 6 semanas | App em uso |
| 4 | [Materno-infantil](docs/plano/fase-4-materno-infantil.md) | 4 semanas | |
| 5 | [UAN e Qualidade](docs/plano/fase-5-uan-qualidade.md) (Enterprise) | 10 semanas | **Piloto Enterprise** |
| 6 | [Saúde pública e avançados](docs/plano/fase-6-saude-publica-avancados.md) | contínuo | |

\* Com 2 desenvolvedores full-stack. Cronograma, marcos e regras de trabalho em [docs/plano/00-visao-geral.md](docs/plano/00-visao-geral.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Web | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Hook Form + Zod, TanStack Query, Recharts |
| Backend | Supabase: Postgres com Row Level Security, Auth, Storage, Edge Functions, Realtime, pgvector |
| Automação | n8n (self-hosted): WhatsApp, e-mail, lembretes e rotinas |
| IA | API de LLM com saída estruturada + RAG em pgvector |
| App do paciente | PWA (primeira versão) → Expo/React Native |
| Qualidade | Vitest, Playwright, pgTAP, ESLint, Prettier |
| Infra | MVP inteiro na VPS existente (Oracle ARM + Coolify/Traefik): app web, Supabase self-hosted e n8n; backup diário externo; Sentry ([ADR 0004](docs/adr/0004-infraestrutura-hospedagem.md)) |

Decisões registradas em [docs/adr/](docs/adr/).

## Arquitetura

```
 Nutricionista ─▶ Web (Next.js) ─┐             ┌─▶ n8n ─▶ WhatsApp / e-mail
                                 ├─▶ Supabase ─┤
 Paciente ──────▶ PWA ───────────┘  (Postgres  └─▶ LLM (sugestões, RAG)
                                     + RLS)
```

- **Multi-tenant:** todas as tabelas de negócio têm `organization_id` e são isoladas por RLS ([ADR 0002](docs/adr/0002-multi-tenant-rls.md)).
- **Cálculos nutricionais** ficam no pacote `nutrition-core`, como funções puras testadas contra a literatura. O LLM nunca calcula nutrientes.
- Detalhes em [docs/03-arquitetura.md](docs/03-arquitetura.md) e modelo de dados em [docs/04-modelo-dados.md](docs/04-modelo-dados.md).

## Estrutura do repositório

Estrutura prevista a partir da Fase 0:

```
apps/
  web/                 # Next.js: painel do profissional + PWA do paciente
packages/
  nutrition-core/      # fórmulas e cálculos nutricionais (TS puro)
  db/                  # tipos gerados do Supabase e acesso a dados
  ui/                  # componentes compartilhados
  config/              # eslint, tsconfig, tailwind
supabase/
  migrations/          # SQL versionado
  functions/           # Edge Functions
  tests/               # testes de RLS (pgTAP)
  seed/                # bases de alimentos e dados de demonstração
scripts/               # importadores (TACO, TBCA, OMS)
n8n/workflows/         # fluxos de automação exportados
docs/                  # produto, arquitetura, plano e ADRs
```

## Como rodar localmente

> Disponível após a Fase 0 (RN-001 a RN-003). Os comandos abaixo são os previstos.

**Pré-requisitos:** Node.js LTS (ver `.nvmrc`), pnpm, Docker e Supabase CLI.

```bash
git clone https://github.com/brunokobi/plataforma_rafanutri.git
cd plataforma_rafanutri
pnpm install
cp .env.example apps/web/.env.local   # preencher com os valores locais
pnpm db:start                          # sobe o Supabase local e aplica migrações
pnpm db:seed:demo                      # dados fictícios para desenvolvimento
pnpm dev                               # http://localhost:3000
```

O Supabase Studio local fica em `http://localhost:54323` e os e-mails de teste em `http://localhost:54324`.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe o app web em modo desenvolvimento |
| `pnpm build` | Build de todos os pacotes |
| `pnpm lint` / `pnpm typecheck` | Qualidade de código |
| `pnpm test` | Testes unitários (Vitest) |
| `pnpm test:e2e` | Testes end-to-end (Playwright) |
| `pnpm db:start` / `pnpm db:stop` | Supabase local |
| `pnpm db:reset` | Recria o banco local a partir das migrações |
| `pnpm db:test` | Testes de RLS (pgTAP) |
| `pnpm db:types` | Gera os tipos TypeScript do banco |
| `pnpm db:seed:demo` | Carrega dados fictícios |
| `pnpm import:taco` | Importa a tabela TACO |

## Variáveis de ambiente

A lista completa, sem valores reais, fica em `.env.example`. Principais:

| Variável | Onde | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente | Chave pública (protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Somente servidor** | Operações administrativas controladas |
| `RESEND_API_KEY` | Servidor | E-mail transacional |
| `LLM_API_KEY` | Servidor | Provedor de IA (Fase 3) |
| `N8N_WEBHOOK_SECRET` | Servidor | Assinatura dos webhooks com o n8n (Fase 2) |
| `SENTRY_DSN` | Ambos | Monitoramento de erros |

Nunca versione arquivos `.env*` com valores reais.

## Fluxo de contribuição

- `main` é protegida e sempre implantável; trabalho em branches `feat/RN-xxx-descricao`, `fix/...`, `docs/...`, `chore/...`.
- Commits no padrão Conventional Commits, em português: `feat(clinico): editor de plano alimentar (RN-031)`.
- Um item do backlog por pull request, com descrição, como testar e prints.
- CI obrigatório: lint, typecheck, testes, testes de RLS e build.
- Toda tabela nova precisa de política RLS e teste de isolamento.
- Merge em `main` publica em staging; produção por tag, com aprovação manual.

Critérios completos de pronto em [docs/plano/00-visao-geral.md](docs/plano/00-visao-geral.md).

## Segurança e LGPD

A plataforma trata **dados sensíveis de saúde**. No MVP, a adequação à LGPD está adiada, mas valem sempre:

- Isolamento por organização com RLS e testes automatizados.
- Segredos fora do repositório.
- Backup diário do banco fora da VPS, com teste de restauração.

O alvo pós-MVP inclui auditoria, consentimento do paciente, dados no Brasil e IA com dados pseudonimizados.

Ver [docs/05-seguranca-lgpd.md](docs/05-seguranca-lgpd.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/INDEX.md](docs/INDEX.md) | Índice geral |
| [docs/01-visao-produto.md](docs/01-visao-produto.md) | Visão, público, modelo de negócio, métricas |
| [docs/02-modulos.md](docs/02-modulos.md) | Módulos e prioridades |
| [docs/modulos/uan.md](docs/modulos/uan.md) | Plano do módulo UAN e Qualidade |
| [docs/03-arquitetura.md](docs/03-arquitetura.md) | Arquitetura e integrações |
| [docs/04-modelo-dados.md](docs/04-modelo-dados.md) | Modelo de dados |
| [docs/05-seguranca-lgpd.md](docs/05-seguranca-lgpd.md) | Segurança, LGPD e regulatório |
| [docs/06-plano-implementacao.md](docs/06-plano-implementacao.md) | Resumo do plano |
| [docs/plano/](docs/plano/00-visao-geral.md) | Plano detalhado por fase |
| [docs/07-backlog.md](docs/07-backlog.md) | Backlog consolidado |
| [docs/adr/](docs/adr/) | Decisões de arquitetura |

---

© Rafanutri. Todos os direitos reservados.
