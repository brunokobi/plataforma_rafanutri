<h1 align="center">Rafanutri</h1>

<p align="center"><strong>A plataforma de trabalho do nutricionista, do consultório à cozinha industrial.</strong></p>

<p align="center">
  <a href="docs/plano/00-visao-geral.md"><img alt="status: MVP no ar" src="https://img.shields.io/badge/status-MVP%20no%20ar-2E7D32?style=flat-square"></a>
  <a href="docs/06-plano-implementacao.md"><img alt="roadmap: 8 fases" src="https://img.shields.io/badge/roadmap-8%20fases-2E7D32?style=flat-square"></a>
  <a href="docs/07-backlog.md"><img alt="backlog: 224 itens" src="https://img.shields.io/badge/backlog-224%20itens-2E7D32?style=flat-square"></a>
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
  <a href="https://www.postgresql.org"><img alt="PostgreSQL: 16" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white"></a>
  <img alt="Avisos: Telegram e e-mail" src="https://img.shields.io/badge/avisos-Telegram%20%2B%20e--mail-26A5E4?style=flat-square&logo=telegram&logoColor=white">
</p>
<p align="center">
  <a href="docs/adr/0004-infraestrutura-hospedagem.md"><img alt="Oracle Cloud: ARM64" src="https://img.shields.io/badge/Oracle%20Cloud-ARM64-F80000?style=flat-square"></a>
  <img alt="Docker: Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white">
  <img alt="Coolify: Traefik" src="https://img.shields.io/badge/Coolify-Traefik-8C52FF?style=flat-square&logo=coolify&logoColor=white">
  <img alt="Cloudflare: DNS" src="https://img.shields.io/badge/Cloudflare-DNS-F38020?style=flat-square&logo=cloudflare&logoColor=white">
</p>

A Rafanutri reúne as áreas da nutrição em um só lugar: atendimento clínico e esportivo, nutrição materno-infantil, saúde pública, Unidades de Alimentação e Nutrição (UAN) com gestão de qualidade, e gestão do negócio do nutricionista. Também traz assistentes de IA e um app para o paciente acompanhar o plano alimentar.

> **Status (22/11/2026):** MVP **no ar em https://rafanutri.brunokobi.tech**, gravando no banco. Entregue:
>
> - **Clínico:** pacientes com tipo de acompanhamento, agenda, anamnese por link, avaliações, plano alimentar com PDF, modelos, alimentos e preparações próprios, orientações, prontuário com evoluções assinadas, documentos clínicos e **painéis clínicos** (geral e por paciente).
> - **Área do paciente** (web responsiva em `/p`): plano, receitas, recomendações, PDFs e documentos.
> - **Gestão** (planos pagos): financeiro, recibos, pacotes, CRM, indicadores, página pública com agendamento online e **avisos por Telegram e e-mail**.
> - **Assistente de IA** (OpenRouter, só modelos gratuitos) e **materno-infantil completo** (curvas da OMS, gestação, lactação, introdução alimentar, responsáveis e visão no app).
> - **Saúde pública, bloco A:** triagens NRS-2002, MUST e ASG e painel de risco.
> - **UAN e Qualidade** (Enterprise), **assinatura por Pix**, auditoria, aceite dos termos e **visual próprio por módulo**.
> - Base de alimentos com cerca de 17.000 itens: TACO (597), IBGE POF 2008-2009 (1.923), Open Food Facts (8.406) e USDA SR Legacy (6.132).
>
> Veja o [progresso](docs/plano/progresso.md).

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

> **MVP:** tudo roda na VPS existente (vpsrafa), com avisos pelo Telegram e por e-mail (Resend) e IA pelos modelos gratuitos do OpenRouter. A adequação completa à LGPD fica para depois do MVP ([ADR 0004](docs/adr/0004-infraestrutura-hospedagem.md)).

- **Nutricionistas** usam várias ferramentas soltas: uma para calcular dieta, outra para agenda, WhatsApp para falar com o paciente e planilha para o financeiro. A Rafanutri junta tudo e usa IA para reduzir o tempo de montar um plano alimentar para **menos de 10 minutos**.
- **Pacientes** veem o plano no celular, com substituições, receitas, recomendações e PDFs.
- **Empresas de alimentação** substituem papel e planilha por checklists digitais, fichas técnicas com custo e documentação de Boas Práticas pronta para a fiscalização (RDC 216/2004).

## Módulos

| Módulo | Para quem | Destaques |
|---|---|---|
| **Núcleo** | Todos | Contas e equipes, pacientes, agenda, prontuário, base de alimentos (TACO, IBGE, Open Food Facts e USDA), PDFs com a marca do profissional |
| **1. Clínico e Esportivo** | Nutricionistas de consultório, academias, estética | Anamnese por link, antropometria e composição corporal, gasto energético, plano alimentar com cálculo em tempo real e substituições |
| **2. Materno-Infantil** | Nutrição pediátrica e gestantes | Curvas de crescimento da OMS com escore-z, ganho de peso gestacional, lactação, introdução alimentar, responsáveis e app da família |
| **3. Saúde Pública** | UBS, ambulatórios, programas | Triagens (NRS-2002, MUST e ASG; MNA pendente de licença), painel de risco; depois programas, indicadores e território |
| **4. UAN e Qualidade** | Restaurantes, hospitais, escolas, hotéis | Ficha técnica, cardápio cíclico, compras, estoque, checklists BPF, POPs, APPCC, rotulagem |
| **5. Gestão do consultório** | Profissionais e clínicas | Avisos e lembretes pelo Telegram (e e-mail no importante), CRM, financeiro, recibos, pacotes, agendamento online. Fora do plano Gratuito |
| **IA** | Nutricionista | Pergunta livre, ideias de receitas, resumo da anamnese e sugestão de cardápio, sem dados que identifiquem o paciente (sempre revisado pelo profissional) |
| **Área do paciente** | Paciente | Plano alimentar, receitas, recomendações e PDFs (MVP); depois diário, hidratação, lista de compras e chat |

Detalhes e prioridades em [docs/02-modulos.md](docs/02-modulos.md).

### O que já está em produção na UAN (19/11/2026)

- **Qualidade BPF:** checklists no celular (foto, assinatura, offline), temperaturas com alerta, não conformidades com 5W2H, painel de conformidade com pendências documentais.
- **Ficha técnica e cardápio:** insumos, fornecedores e preços; fichas com FC, IC, rendimento, custo, nutrientes, alergênicos e foto; cardápio cíclico com aprovação, perfis de público com metas (PAT/PNAE a validar), regras do contrato e ajuste local de per capita; cardápio público com QR Code, modo TV e pesquisa de satisfação.
- **Produção, compras e estoque:** comensais, lista de preparo, requisição, desperdício; necessidade de compra, pedido, recebimento com recusa e foto; lotes FEFO e inventário cego; custos planejado × realizado e curva ABC; painel da rede e relatório mensal em PDF.
- **Documentação e fiscalização:** POPs com versão, aprovação e ciência; treinamentos com certificado; Manual de Boas Práticas e dossiê em PDF; licenças; planilhas CSV; integridade SHA-256 dos registros.
- **APPCC e rotulagem:** plano com árvore do Codex, PCC e PDF; rótulo nutricional da IN 75/2020 (vertical, horizontal e linear) com lupa e alergênicos.
- **Contrato e implantação:** situação, faturas e modo leitura quando o contrato termina; administração da plataforma em `/app/admin` (contratos e faturas); importação de fornecedores, insumos e fichas por planilha ([roteiro](docs/guias/implantacao-enterprise.md)).

### Outros módulos em produção (22/11/2026)

- **Avisos ao paciente:** Telegram para tudo (@RafanutriAvisosBot) e e-mail (Resend) só no importante.
- **Assistente de IA:** modelos gratuitos do OpenRouter, sem dados que identifiquem o paciente; cota diária de 5 pedidos (Gratuito), 20 (Essencial) ou 200 (Profissional e Clínica).
- **Materno-infantil** (Profissional e Clínica): curvas da OMS com alertas, ganho de peso na gestação pelas curvas brasileiras, adicional energético no plano, lactação, introdução alimentar com alergênicos e texturas, responsáveis legais com consentimento e acompanhamento no app do paciente. Página de entrada `/app/materno-infantil`.
- **Esportivo:** página `/app/esportivo` com os atletas e ficha com visual próprio. O tipo de acompanhamento do paciente (automático, clínico, esportivo ou materno-infantil) define o visual da ficha.
- **Saúde pública** (por contrato): triagens NRS-2002, MUST e ASG na ficha e painel de pacientes em risco.
- **Planos:** Gratuito (R$ 0, 20 pacientes ativos, com anúncios do Google só nas telas sem dado de paciente), Essencial (R$ 49,90/mês ou R$ 299,40/ano, 100), Profissional (R$ 99,90/mês ou R$ 599,40/ano, sem limite) e Clínica (R$ 199,90/mês ou R$ 1.199,40/ano, equipe sem limite). O anual tem 50% de desconto (12 meses pelo preço de 6). Pagamento pela InfinitePay (Pix grátis ou cartão, plano liberado automaticamente) ou por Pix direto com confirmação do admin; módulo Gestão fora do Gratuito. Gateway de cobrança avaliado em [docs/pesquisa/cobranca-gateways.md](docs/pesquisa/cobranca-gateways.md).

Depende de definição externa: gateway com baixa automática (opcional), revisão da RT dos textos-base e critérios marcados "a validar" e licença da MNA. Detalhes em [docs/plano/progresso.md](docs/plano/progresso.md) e [docs/modulos/uan.md](docs/modulos/uan.md).

## Estratégia de lançamento

1. **Plano gratuito** com até 20 pacientes ativos por nutricionista para atrair usuários no MVP.
2. **Clínico + Gestão** como base dos planos pagos, por Pix: Essencial R$ 49,90/mês, Profissional R$ 99,90/mês e Clínica R$ 199,90/mês (por consultório, equipe sem limite), ou anual com 50% de desconto.
3. **Área do paciente** como mecanismo de retenção: quando os pacientes usam o app, trocar de sistema fica caro para o profissional.
4. **UAN/Qualidade Enterprise** em seguida: contratos B2B por unidade produtora (referência de R$ 500 a R$ 2.000+/mês).

Ver [docs/01-visao-produto.md](docs/01-visao-produto.md).

## Roadmap

| Fase | Entrega | Duração estimada* | Marco / situação |
|---|---|---|---|
| 0 | [Fundação](docs/plano/fase-0-fundacao.md): monorepo, auth, organizações, isolamento, TACO, CI/CD | 3 semanas | Base pronta |
| 1 | [MVP Clínico](docs/plano/fase-1-mvp-clinico.md): pacientes, agenda, anamnese, avaliação, plano alimentar, PDF | 8 semanas | |
| 1B | [Plano gratuito e área do paciente](docs/plano/fase-1b-freemium-area-paciente.md): até 20 pacientes grátis; paciente vê plano, receitas e recomendações | 3 semanas | **Beta com plano gratuito** |
| 2 | [Gestão](docs/plano/fase-2-gestao.md): avisos por Telegram e e-mail, financeiro, CRM, assinatura por Pix | 4 semanas | **Lançamento pago** |
| 3 | [App do paciente + IA](docs/plano/fase-3-app-paciente-ia.md) | 6 semanas | Entregue: área do paciente web e assistente de IA (app nativo, diário e chat ficam para depois) |
| 4 | [Materno-infantil](docs/plano/fase-4-materno-infantil.md) | 4 semanas | Entregue (22/11/2026); faltam idade corrigida de prematuros e PDF das curvas |
| 5 | [UAN e Qualidade](docs/plano/fase-5-uan-qualidade.md) (Enterprise) | 10 semanas | **Piloto Enterprise** |
| 6 | [Saúde pública e avançados](docs/plano/fase-6-saude-publica-avancados.md) | contínuo | bloco A (triagens) em andamento |

\* Com 2 desenvolvedores full-stack. Cronograma, marcos e regras de trabalho em [docs/plano/00-visao-geral.md](docs/plano/00-visao-geral.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript estrito, Tailwind CSS 4, shadcn/ui, React Hook Form + Zod, motion, react-markdown |
| PDF | `@react-pdf/renderer` (plano alimentar, documentos, recibos, Manual de BPF, dossiê) |
| Backend | **Directus 12** sobre Postgres 16: autenticação, permissões por organização, API e arquivos; regras de negócio na extensão `rafanutri` (endpoints) e em `rafanutri-hooks` ([ADR 0008](docs/adr/0008-backend-directus.md)) |
| Avisos | Motor dentro da extensão: Telegram (bot) e e-mail pelo Resend |
| IA | OpenRouter, só modelos gratuitos, chamado pela extensão; sem RAG |
| Área do paciente | Web responsiva em `/p`, no mesmo app Next.js |
| Qualidade | Vitest, Playwright, `node --test` (regras da extensão), testes SQL puros em `db/tests/*.test.sql`, ESLint |
| Infra | VPS existente (vpsrafa, Oracle ARM64) com Coolify/Traefik: app web e Directus; backup diário na VPS ([ADR 0004](docs/adr/0004-infraestrutura-hospedagem.md)) |

Decisões registradas em [docs/adr/](docs/adr/).

## Arquitetura

```
 Nutricionista ─▶ Web (Next.js) ─┐                       ┌─▶ Telegram (bot) / Resend (e-mail)
                                 ├─▶ Directus + extensão ┤
 Paciente ──────▶ Web /p ────────┘    (Postgres 16)      └─▶ OpenRouter (modelos gratuitos)
```

- **Backend:** Directus sobre Postgres ([ADR 0008](docs/adr/0008-backend-directus.md)).
- **Multi-tenant:** todas as tabelas de negócio têm `organization_id`. O isolamento combina três camadas:
  - permissões do Directus filtradas pela organização do usuário;
  - ganchos que validam a organização na gravação;
  - gatilhos no banco para as regras invioláveis.
- **Avisos e IA** rodam dentro da extensão do Directus (fila de avisos a cada minuto; chamada ao OpenRouter no servidor). Não há serviço de automação separado.
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
      foods/              # base de alimentos (TACO, IBGE, Open Food Facts e USDA) pela API do Directus: busca e substitutos
      patients/           # pacientes: validação (CPF, telefone), leitura e Server Actions
      modules/            # catálogo de módulos, planos (plans.ts) e visual por módulo (theme.ts)
      demo/               # dados de exemplo do módulo clínico (pré-lançamento)
      pdf/                # dados do PDF do plano alimentar
      …                   # uma pasta por área: agenda, financeiro, CRM, UAN, materno-infantil, saúde pública, IA…
    tests/  e2e/          # Vitest + Testing Library · Playwright
    Dockerfile            # imagem de produção (Next.js standalone, ARM64)
packages/
  nutrition-core/         # fórmulas e cálculos nutricionais (TS puro)
  forms/                  # formato dos questionários e validador das respostas (app + extensão do Directus)
  catalogs/               # catálogos compartilhados app + extensão (planos, IA, termos, avisos, motivos de atenção, materno-infantil, triagens)
  config/                 # tsconfig base
db/
  migrations/             # SQL versionado e idempotente (0001 alimentos … 0069 plano anual)
  seed/taco/              # TACO 4ª edição (CSV + importador + gerador a partir da planilha oficial)
  seed/ibge/              # IBGE POF 2008-2009 (CSV + importador + gerador a partir das planilhas oficiais)
  seed/off/ seed/usda/    # Open Food Facts (Brasil) e USDA SR Legacy (CSVs + geradores); importador comum seed/import_foods.sql
  seed/plan-library/      # biblioteca de 42 modelos de plano (gerador + SQL)
  seed/dev/               # seed de nutricionista de teste com consultório e pacientes
  tests/                  # testes SQL das regras do banco, regras da extensão (node --test) e isolamento pela API
  scripts/                # isolation-test.sh (isolamento sem token) e metrics.sh (métricas do plano gratuito)
directus/extensions/
  rafanutri/              # endpoints próprios em /rafanutri (292 rotas em 10 arquivos; ver abaixo)
  rafanutri-hooks/        # ganchos: gravação só no próprio consultório, limite do plano, e-mails em português
  templates/              # modelos de e-mail (aviso e recuperação de senha)
docs/                     # produto, arquitetura, plano, specs, runbooks e ADRs
.github/workflows/        # CI: lint, typecheck, testes, build e e2e
```

### Extensão `rafanutri` por arquivo

Contagem de rotas por `router.get|post|put|patch|delete(` em 22/11/2026, depois da divisão do `index.js` por área (a ordem de registro das rotas não mudou). Os arquivos sem rotas guardam regras puras, testadas em `db/tests/extension-*.test.mjs`.

| Arquivo | Rotas | Conteúdo |
|---|---|---|
| `index.js` | 48 | Núcleo: consultórios, pacientes, agenda, anamneses, planos alimentares, prontuário, documentos, alimentos próprios e receitas, filtro do módulo Gestão por plano; monta os demais arquivos (1.167 linhas) |
| `uan.js` | 139 | UAN e Qualidade: unidades, equipe, checklists, temperaturas, não conformidades, insumos, fichas técnicas, cardápios, produção, estoque, compras, documentos, APPCC, rótulos, cardápio publicado, contrato, importação, rede e administração dos contratos |
| `practice.js` | 35 | Gestão do consultório: financeiro, recibos, pacotes, CRM, indicadores e página pública com agendamento online |
| `patient-area.js` | 20 | Área do paciente: convite e vínculo, aceite dos termos, marca do consultório, plano e o que o paciente vê |
| `notify.js` | 17 | Motor dos avisos (0058): fila a cada minuto, Telegram e e-mail, webhook do bot, preferências |
| `maternal.js` | 15 | Materno-infantil (0062, 0065): medidas, gestação, lactação, introdução alimentar, responsáveis, `/maternal/overview` |
| `subscriptions.js` | 11 | Assinatura por Pix (0059, 0069): mensal ou anual com 50% de desconto, consultório e admin, ciclo de renovação |
| `public-health.js` | 3 | Triagens (0066) e painel `/public-health/overview` |
| `clinical-dashboard.js` | 2 | Painéis clínicos: `/clinical/patients-dashboard` e `/patients/:id/dashboard` |
| `ai.js` | 2 | Assistente de IA (0063): `/ai/status` e `/ai/ask` |
| `ai-core.js` | 0 | Regras da IA: modelos gratuitos, anonimização, cota |
| `billing.js` | 0 | Código Pix (BR Code), períodos e valores |
| `notifications.js` | 0 | Regras dos avisos: canal, janelas de lembrete, textos |
| `foods.js`, `finance.js`, `crm.js`, `booking.js`, `documents.js` | 0 | Validações e cálculos de alimentos próprios, financeiro, CRM, agendamento online e documentos clínicos |
| `forms.js` | 0 | Cópia de `packages/forms` (questionários) |
| `catalogs.js` | 0 | Cópia de `packages/catalogs` (planos, IA, termos, avisos, motivos de atenção, materno-infantil, triagens): `pnpm --filter @rafanutri/catalogs sync` |

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
SEED_EMAIL=<email> SEED_PASSWORD=<senha> pnpm db:seed:demo   # consultório, pacientes, agenda, avaliações, planos e anamneses
# só consultório e pacientes: node db/seed/dev/seed-nutricionista.mjs (SEED_CREATE_USER=1 cria a conta)
```

O que está feito e o que falta: [docs/plano/progresso.md](docs/plano/progresso.md).

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe o app web em modo desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm lint` / `pnpm typecheck` | Qualidade de código (ESLint e TypeScript estrito) |
| `pnpm test` | Testes unitários e de componente (Vitest + Testing Library) |
| `pnpm test:e2e` | Testes end-to-end (Playwright). Com `E2E_USER_EMAIL` e `E2E_USER_PASSWORD` (usuário de teste com consultório) roda também o login real e o fluxo completo de consulta; `E2E_BASE_URL=https://rafanutri.brunokobi.tech` testa a produção (um navegador por vez, por causa do limite de requisições do Directus). No WSL Ubuntu 20.04, instale o navegador com `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 npx playwright install chromium` e use a mesma variável ao rodar |
| `node --test db/tests/extension-*.test.mjs` | Regras puras da extensão do Directus (11 arquivos: alimentos, financeiro, CRM, agendamento, documentos, avisos, cobrança, IA, materno-infantil, saúde pública, painéis clínicos) |
| `db/scripts/isolation-test.sh` | Isolamento entre consultórios pela API em produção (99 verificações; sem token de admin, limpa pelo banco via SSH). No CI: workflow `isolation.yml`, semanal, com o secret `ISOLATION_SSH_KEY` |

## Deploy

- **Deploy manual, sem staging:** só existe o ambiente de produção.
- **App web:** aplicação `rafanutri-web` no Coolify da vpsrafa, com deploy **disparado manualmente** após o push (o deploy automático depende do webhook do GitHub, pendente).
- **Backend:** Directus 12 (licença gratuita Open Innovation Grant) + Postgres em `~/apps/rafanutri-directus/` na vpsrafa. Migrações de `db/` aplicadas à mão com `psql` (com `pg_dump` antes); extensões de `directus/extensions/` copiadas para a VPS e `docker compose restart directus`. Ver o [db/README.md](db/README.md) e o [runbook do Directus](docs/runbooks/directus-vpsrafa.md).
- **Backup:** diário na VPS (00h de Brasília, 14 dias). Falta uma cópia fora da VPS.
- Imagem: `apps/web/Dockerfile` (multi-stage, `turbo prune`, Next.js `standalone`, ARM64).
- Domínio: **https://rafanutri.brunokobi.tech**. Verificação de saúde: `/api/health`.
- CI no GitHub Actions (`ci.yml`): lint, typecheck, testes, build e e2e em todo push e pull request. `isolation.yml`: teste de isolamento semanal.
- Passo a passo, variáveis e rollback: [docs/runbooks/deploy-web-coolify.md](docs/runbooks/deploy-web-coolify.md).

## Variáveis de ambiente

A lista completa, sem valores reais, fica nos arquivos `.env.example`. Principais:

| Variável | Onde | Uso |
|---|---|---|
| `DIRECTUS_URL` | Servidor do app web | URL da API do Directus (`https://rafanutri-api.brunokobi.tech`) |
| `NEXT_PUBLIC_SITE_URL` | App web (build e execução) | URL pública do app (`https://rafanutri.brunokobi.tech`) |
| `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_CNPJ`, `NEXT_PUBLIC_LEGAL_EMAIL`, `NEXT_PUBLIC_LEGAL_DPO` | App web (build) | Razão social, CNPJ, e-mail de contato e encarregado de dados mostrados nos Termos e na Política de Privacidade (opcionais; sem eles, os textos apontam para o botão Feedback) |
| `SIGNUP_OPEN` | Servidor do app web | `true` libera o cadastro e o onboarding no Directus; padrão `false` (pré-lançamento) |
| `KEY` / `SECRET` | Directus | Chaves da instância; `SECRET` também assina o link de cancelar e-mails |
| `LICENSE_KEY` | Directus | Licença Open Innovation Grant (libera permissões com filtro) |
| `EMAIL_*` | Directus | SMTP do Resend (domínio `brunokobi.tech` verificado em 20/11/2026), remetente `nao-responda@brunokobi.tech`. `EMAIL_TEMPLATES_PATH=/directus/extensions/templates` (modelos em português) e `PASSWORD_RESET_URL_ALLOW_LIST=https://rafanutri.brunokobi.tech/redefinir-senha` |
| `USER_REGISTER_URL_ALLOW_LIST` / `PASSWORD_RESET_URL_ALLOW_LIST` | Directus | URLs do app aceitas nos e-mails de cadastro e senha |
| `DIRECTUS_ADMIN_EMAIL` / `DIRECTUS_ADMIN_PASSWORD` | Scripts de manutenção | Bootstrap e migrações; **nunca** no app web |
| `DB_PASSWORD` | Directus e scripts | Senha do Postgres |
| `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT` | App web (build) | Conta do AdSense (tem padrão) e bloco fixo opcional dos anúncios do plano Gratuito |
| `OPENROUTER_API_KEY` | Directus | Chave do OpenRouter para o assistente de IA (só modelos gratuitos) |
| `TELEGRAM_BOT_TOKEN` | Directus | Bot dos avisos; sem ela o Telegram fica desligado e só o e-mail importante sai |
| `RAFANUTRI_SITE_URL` | Directus | URL do app nos links dos avisos (padrão `https://rafanutri.brunokobi.tech`) |
| `PUBLIC_URL` | Directus | URL da API, usada para registrar o webhook do bot |

Nunca versione arquivos `.env*` com valores reais.

## Fluxo de contribuição

- `main` é protegida e sempre implantável; trabalho em branches `feat/RN-xxx-descricao`, `fix/...`, `docs/...`, `chore/...`.
- Commits no padrão Conventional Commits, em português: `feat(clinico): editor de plano alimentar (RN-031)`.
- Um item do backlog por pull request, com descrição, como testar e prints.
- CI obrigatório: lint, typecheck, testes e build.
- Toda tabela nova com `organization_id` precisa de permissões filtradas no Directus, gancho de gravação, gatilhos para as regras invioláveis e cenários no teste de isolamento (`db/tests/api-isolation.test.mjs`).
- Não há staging: o deploy em produção é manual (Coolify para o web; cópia da extensão e restart do Directus; migrações com `pg_dump` antes).

Critérios completos de pronto em [docs/plano/00-visao-geral.md](docs/plano/00-visao-geral.md).

## Segurança e LGPD

A plataforma trata **dados sensíveis de saúde**. No MVP, a adequação completa à LGPD está adiada, mas já valem:

- Isolamento por consultório (permissões do Directus + ganchos + gatilhos) com testes automatizados.
- Auditoria de quem criou, alterou, abriu ou exportou dados clínicos e financeiros (0030).
- Aceite registrado dos Termos e da Política de Privacidade, por versão (0057).
- IA sem dados que identifiquem o paciente; nenhum texto enviado à IA é gravado.
- Segredos fora do repositório.
- Backup diário do banco na VPS. **Pendente:** cópia fora da VPS e teste de restauração periódico.

O alvo pós-MVP inclui dados no Brasil e revisão jurídica dos textos legais.

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
| [docs/guias/implantacao-enterprise.md](docs/guias/implantacao-enterprise.md) | Roteiro de implantação de um cliente UAN |
| [docs/seguranca/](docs/seguranca/) | Revisão de segurança da Fase 1 e auditoria |
| [docs/adr/](docs/adr/) | Decisões de arquitetura |

---

© Rafanutri. Todos os direitos reservados.
