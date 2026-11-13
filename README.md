<h1 align="center">Rafanutri</h1>

<p align="center"><strong>A plataforma de trabalho do nutricionista, do consultório à cozinha industrial.</strong></p>

<p align="center">
  <a href="docs/plano/00-visao-geral.md"><img alt="status: MVP em construção" src="https://img.shields.io/badge/status-MVP%20em%20constru%C3%A7%C3%A3o-F59E0B?style=flat-square"></a>
  <a href="docs/06-plano-implementacao.md"><img alt="roadmap: 8 fases" src="https://img.shields.io/badge/roadmap-8%20fases-2E7D32?style=flat-square"></a>
  <a href="docs/07-backlog.md"><img alt="backlog: 204 itens" src="https://img.shields.io/badge/backlog-204%20itens-2E7D32?style=flat-square"></a>
  <a href="docs/adr/"><img alt="ADRs: 5" src="https://img.shields.io/badge/ADRs-5-2E7D32?style=flat-square"></a>
  <img alt="docs: pt-BR" src="https://img.shields.io/badge/docs-pt--BR-009C3B?style=flat-square">
  <img alt="licença: proprietária" src="https://img.shields.io/badge/licen%C3%A7a-propriet%C3%A1ria-6B7280?style=flat-square">
</p>
<p align="center">
  <a href="https://nextjs.org"><img alt="Next.js: 16" src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white"></a>
  <a href="https://react.dev"><img alt="React: 19" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black"></a>
  <a href="https://ui.shadcn.com"><img alt="shadcn/ui" src="https://img.shields.io/badge/shadcn%2Fui-componentes-000000?style=flat-square&logo=shadcnui&logoColor=white"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript: strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="https://tailwindcss.com"><img alt="Tailwind CSS: 4" src="https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white"></a>
  <a href="docs/adr/0008-backend-directus.md"><img alt="Directus: 12" src="https://img.shields.io/badge/Directus-12-6644FF?style=flat-square&logo=directus&logoColor=white"></a>
  <a href="https://www.postgresql.org"><img alt="PostgreSQL: 16 + pgvector" src="https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-4169E1?style=flat-square&logo=postgresql&logoColor=white"></a>
  <a href="https://n8n.io"><img alt="n8n: automações" src="https://img.shields.io/badge/n8n-automa%C3%A7%C3%B5es-EA4B71?style=flat-square&logo=n8n&logoColor=white"></a>
</p>
<p align="center">
  <a href="docs/adr/0004-infraestrutura-hospedagem.md"><img alt="Oracle Cloud: ARM64" src="https://img.shields.io/badge/Oracle%20Cloud-ARM64-F80000?style=flat-square"></a>
  <img alt="Docker: Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white">
  <img alt="Coolify: Traefik" src="https://img.shields.io/badge/Coolify-Traefik-8C52FF?style=flat-square&logo=coolify&logoColor=white">
  <img alt="Cloudflare: DNS" src="https://img.shields.io/badge/Cloudflare-DNS-F38020?style=flat-square&logo=cloudflare&logoColor=white">
</p>

A Rafanutri reúne as áreas da nutrição em um só lugar: atendimento clínico e esportivo, nutrição materno-infantil, saúde pública, Unidades de Alimentação e Nutrição (UAN) com gestão de qualidade, e gestão do negócio do nutricionista. Também traz assistentes de IA e um app para o paciente acompanhar o plano alimentar.

> **Status (12/11/2026):** MVP em construção, **no ar em https://rafanutri.brunokobi.tech**. Já gravam no banco: cadastro com login automático, onboarding do consultório (plano gratuito), **pacientes** (cadastro, ficha, edição, limite de 20 ativos), **avaliações antropométricas**, **planos alimentares por paciente** (rascunho, publicação e versões), **agenda** de consultas **anamneses** com link público para o paciente responder **modelos de plano** com ajuste à meta de calorias e **alimentos e preparações do consultório** e um **painel inicial** com o dia do nutricionista e a base de alimentos **TACO 4ª edição** usada pelo editor de plano alimentar.  Veja o [progresso](docs/plano/progresso.md).

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
2. **Clínico + Gestão** como base dos planos pagos: assinatura mensal por nutricionista (referência de R$ 49 a R$ 119/mês), mercado grande e venda rápida.
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
| Backend | **Directus** sobre Postgres (com pgvector): autenticação, permissões por organização, API, arquivos, extensões e Flows ([ADR 0008](docs/adr/0008-backend-directus.md)) |
| Automação | n8n (self-hosted): WhatsApp, e-mail, lembretes e rotinas |
| IA | API de LLM com saída estruturada + RAG em pgvector |
| App do paciente | PWA (primeira versão) → Expo/React Native |
| Qualidade | Vitest, Playwright, pgTAP, ESLint, Prettier |
| Infra | MVP inteiro na VPS existente (Oracle ARM + Coolify/Traefik): app web, Directus e n8n; backup diário externo; Sentry ([ADR 0004](docs/adr/0004-infraestrutura-hospedagem.md)) |

Decisões registradas em [docs/adr/](docs/adr/).

## Arquitetura

```
 Nutricionista ─▶ Web (Next.js) ─┐              ┌─▶ n8n ─▶ WhatsApp / e-mail
                                 ├─▶ Directus ──┤
 Paciente ──────▶ PWA ───────────┘  (Postgres)  └─▶ LLM (sugestões, RAG)
```

- **Backend:** Directus sobre Postgres ([ADR 0008](docs/adr/0008-backend-directus.md)).
- **Multi-tenant:** todas as tabelas de negócio têm `organization_id`. O isolamento combina três camadas:
  - permissões do Directus filtradas pela organização do usuário;
  - ganchos que validam a organização na gravação;
  - gatilhos no banco para as regras invioláveis.
- **Cálculos nutricionais** ficam no pacote `nutrition-core`, como funções puras testadas contra a literatura. O LLM nunca calcula nutrientes.
- Detalhes em [docs/03-arquitetura.md](docs/03-arquitetura.md) e modelo de dados em [docs/04-modelo-dados.md](docs/04-modelo-dados.md).

## Estrutura do repositório

```
apps/
  web/                    # Next.js 16: site, login, cadastro, onboarding e área logada
    app/                  # rotas (App Router); proxy.ts protege /app e /onboarding
    components/           # telas e componentes (ui/ = shadcn/ui)
    lib/
      auth/               # login, sessão, consultórios do usuário e Server Actions (Directus)
      foods/              # base de alimentos (TACO) pela API do Directus: busca e substitutos
      patients/           # pacientes: validação (CPF, telefone), leitura e Server Actions
      modules/            # catálogo de módulos e acesso por plano
      demo/               # dados de exemplo do módulo clínico (pré-lançamento)
      pdf/                # dados do PDF do plano alimentar
    tests/  e2e/          # Vitest + Testing Library · Playwright
    Dockerfile            # imagem de produção (Next.js standalone, ARM64)
packages/
  nutrition-core/         # fórmulas e cálculos nutricionais (TS puro)
  forms/                  # formato dos questionários e validador das respostas (app + extensão do Directus)
  config/                 # tsconfig base
db/
  migrations/             # SQL versionado e idempotente (0001 alimentos … 0013 alimentos do consultório)
  seed/taco/              # TACO 4ª edição (CSV + importador + gerador a partir da planilha oficial)
  seed/dev/               # seed de nutricionista de teste com consultório e pacientes
  tests/                  # testes SQL das regras do banco + teste de isolamento pela API
directus/extensions/
  rafanutri/              # endpoints próprios (/rafanutri/organizations, /rafanutri/me/organizations)
  rafanutri-hooks/        # ganchos: gravação só no próprio consultório, limite do plano
docs/                     # produto, arquitetura, plano, specs, runbooks e ADRs
.github/workflows/        # CI: lint, typecheck, testes, build e e2e
```

Detalhes do banco, das permissões e de como aplicar migrações: [db/README.md](db/README.md).

## Como rodar localmente

**Pré-requisitos:** Node.js 22 (ver `.nvmrc`) e pnpm 9 (`corepack enable`).

```bash
git clone https://github.com/brunokobi/plataforma_rafanutri.git
cd plataforma_rafanutri
pnpm install
cp apps/web/.env.example apps/web/.env.local   # aponta para o Directus da vpsrafa
pnpm dev                                       # http://localhost:3000
```

O app fala com o Directus de `https://rafanutri-api.brunokobi.tech`. Localmente, o cadastro e o onboarding só gravam com `SIGNUP_OPEN=true` (em produção já está ligado). Para ter um nutricionista pronto com consultório e pacientes fictícios:

```bash
SEED_EMAIL=<email> SEED_PASSWORD=<senha> node db/seed/dev/seed-nutricionista.mjs   # SEED_CREATE_USER=1 cria a conta
```

O que está feito e o que falta: [docs/plano/progresso.md](docs/plano/progresso.md).

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe o app web em modo desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm lint` / `pnpm typecheck` | Qualidade de código (ESLint e TypeScript estrito) |
| `pnpm test` | Testes unitários e de componente (Vitest + Testing Library) |
| `pnpm test:e2e` | Testes end-to-end (Playwright); login real com `E2E_USER_EMAIL` e `E2E_USER_PASSWORD` |
| `node --test db/tests/extension-foods.test.mjs` | Regras puras da extensão (conversão do rótulo, composição da preparação) |
| `node db/tests/api-isolation.test.mjs` | Isolamento entre consultórios pela API (53 verificações; exige `DIRECTUS_URL` e `DIRECTUS_ADMIN_TOKEN` só para a limpeza) |

## Deploy

- **App web:** aplicação `rafanutri-web` no Coolify da vpsrafa. Hoje o deploy é **disparado manualmente** após o push; o deploy automático a cada push depende do webhook do GitHub (pendente).
- **Backend:** Directus 12 (licença gratuita Open Innovation Grant) + Postgres em `~/apps/rafanutri-directus/` na vpsrafa; migrações de `db/` e extensões de `directus/extensions/` aplicadas conforme o [db/README.md](db/README.md) e o [runbook do Directus](docs/runbooks/directus-vpsrafa.md).
- Imagem: `apps/web/Dockerfile` (multi-stage, `turbo prune`, Next.js `standalone`, ARM64).
- Domínio: **https://rafanutri.brunokobi.tech**. Verificação de saúde: `/api/health`.
- CI no GitHub Actions: lint, typecheck, testes, build e e2e em todo push e pull request.
- Passo a passo, variáveis e rollback: [docs/runbooks/deploy-web-coolify.md](docs/runbooks/deploy-web-coolify.md).

## Variáveis de ambiente

A lista completa, sem valores reais, fica nos arquivos `.env.example`. Principais:

| Variável | Onde | Uso |
|---|---|---|
| `DIRECTUS_URL` | Servidor do app web | URL da API do Directus (`https://rafanutri-api.brunokobi.tech`) |
| `NEXT_PUBLIC_SITE_URL` | App web (build e execução) | URL pública do app (`https://rafanutri.brunokobi.tech`) |
| `SIGNUP_OPEN` | Servidor do app web | `true` libera o cadastro e o onboarding no Directus; padrão `false` (pré-lançamento) |
| `KEY` / `SECRET` | Directus | Chaves da instância |
| `LICENSE_KEY` | Directus | Licença Open Innovation Grant (libera permissões com filtro) |
| `EMAIL_*` | Directus | SMTP do Resend para verificação de cadastro e recuperação de senha (aguarda DNS do domínio) |
| `USER_REGISTER_URL_ALLOW_LIST` / `PASSWORD_RESET_URL_ALLOW_LIST` | Directus | URLs do app aceitas nos e-mails de cadastro e senha |
| `DIRECTUS_ADMIN_EMAIL` / `DIRECTUS_ADMIN_PASSWORD` | Scripts de manutenção | Bootstrap e migrações; **nunca** no app web |
| `DB_PASSWORD` | Directus e scripts | Senha do Postgres |
| `LLM_API_KEY` | Servidor | Provedor de IA (Fase 3) |
| `N8N_WEBHOOK_SECRET` | Servidor | Assinatura dos webhooks com o n8n (Fase 2) |
| `SENTRY_DSN` | Ambos | Monitoramento de erros |

Nunca versione arquivos `.env*` com valores reais.

## Fluxo de contribuição

- `main` é protegida e sempre implantável; trabalho em branches `feat/RN-xxx-descricao`, `fix/...`, `docs/...`, `chore/...`.
- Commits no padrão Conventional Commits, em português: `feat(clinico): editor de plano alimentar (RN-031)`.
- Um item do backlog por pull request, com descrição, como testar e prints.
- CI obrigatório: lint, typecheck, testes e build.
- Toda tabela nova com `organization_id` precisa de permissões filtradas no Directus, gancho de gravação, gatilhos para as regras invioláveis e cenários no teste de isolamento (`db/tests/api-isolation.test.mjs`).
- Merge em `main` publica em staging; produção por tag, com aprovação manual.

Critérios completos de pronto em [docs/plano/00-visao-geral.md](docs/plano/00-visao-geral.md).

## Segurança e LGPD

A plataforma trata **dados sensíveis de saúde**. No MVP, a adequação à LGPD está adiada, mas valem sempre:

- Isolamento por consultório (permissões do Directus + ganchos + gatilhos) com testes automatizados.
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
| [docs/plano/progresso.md](docs/plano/progresso.md) | **Progresso da implementação** (feito, demonstração, pendente) |
| [docs/specs/](docs/specs/) | Specs das telas: módulos, cadastro e onboarding, módulo clínico em demonstração |
| [db/README.md](db/README.md) | Banco: migrações, TACO, permissões do Directus, testes e seed |
| [docs/runbooks/](docs/runbooks/) | Instalação do Directus e deploy no Coolify |
| [docs/adr/](docs/adr/) | Decisões de arquitetura |

---

© Rafanutri. Todos os direitos reservados.
