# 03 — Arquitetura

Arquitetura em produção em 22/11/2026. Decisões em [ADR 0008](adr/0008-backend-directus.md) (backend) e [ADR 0004](adr/0004-infraestrutura-hospedagem.md) (hospedagem).

## Visão geral

```
                ┌──────────────────────────────────────────────┐
 Nutricionista →│  Web (Next.js 16) — rafanutri.brunokobi.tech │← Paciente (área /p, web responsiva)
                │  páginas, Server Actions, PDFs               │← Público (/n/[slug], /r/[token], /cardapio/[token])
                └──────────────────────┬───────────────────────┘
                                       │ @directus/sdk e fetch (servidor)
                                       ▼
                ┌──────────────────────────────────────────────┐
                │  Directus 12 — rafanutri-api.brunokobi.tech  │
                │  login, permissões, API de itens, arquivos   │
                │  extensão rafanutri (/rafanutri/*)           │
                │  rafanutri-hooks (ganchos de gravação)       │
                └───────┬──────────────────┬───────────────┬───┘
                        │                  │               │
                        ▼                  ▼               ▼
                 ┌────────────┐   ┌─────────────────┐  ┌──────────────────────┐
                 │ Postgres 16│   │ Telegram (bot)  │  │ OpenRouter           │
                 │ 67 migr.   │   │ Resend (e-mail) │  │ (só modelos gratuitos)│
                 └────────────┘   └─────────────────┘  └──────────────────────┘
```

Não há serviço de automação separado: avisos, lembretes e o ciclo de cobrança rodam dentro da extensão do Directus.

## Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript estrito, Tailwind CSS 4, shadcn/ui | Painel do nutricionista, área do paciente (`/p`) e páginas públicas no mesmo app |
| Formulários | React Hook Form + Zod | Validação no app; o banco e a extensão repetem as regras |
| Visual | motion (animações), react-markdown, tema por módulo | `lib/modules/theme.ts` e `app/globals.css` |
| PDF | `@react-pdf/renderer` | Plano alimentar, documentos clínicos, recibos, Manual de BPF, dossiê, certificados |
| Gráficos | SVG próprio | Sem biblioteca de gráficos; curvas da OMS e evolução com tabela ao lado |
| Backend | Directus 12.6.1 (licença Open Innovation Grant) | Login, permissões filtradas por organização, API de itens e arquivos |
| Regras de negócio | Extensão `rafanutri` (endpoints em `/rafanutri`, 292 rotas) e `rafanutri-hooks` | JavaScript puro, sem build. Operações atômicas viram endpoint com transação |
| Banco | Postgres 16 (imagem `pgvector/pgvector:pg16`; a extensão `vector` não é usada) | Migrações SQL em `db/migrations` (0001 a 0067), gatilhos para as regras invioláveis |
| Cálculos | `@rafanutri/nutrition-core` | Funções puras: antropometria, gasto energético, curvas da OMS, triagens, ficha técnica, rotulagem, custos |
| Avisos | Motor em `notify.js` (a cada minuto) | Telegram primeiro; e-mail pelo Resend só no importante |
| IA | OpenRouter, só modelos gratuitos | Chave no `.env` do Directus; contexto sem dados que identifiquem o paciente; sem RAG |
| Testes | Vitest, Playwright, `node --test`, SQL puro | Ver [db/README](../db/README.md) |
| CI | GitHub Actions | `ci.yml` (lint, typecheck, testes, build, e2e) e `isolation.yml` (semanal) |

## Organização do código

```
apps/web/              # Next.js: páginas, componentes, lib/<área>/ (leitura e Server Actions)
packages/
  nutrition-core/      # cálculos puros em TS
  forms/               # formato dos questionários (copiado para a extensão)
  config/              # tsconfig base
db/
  migrations/          # SQL versionado e idempotente
  tests/               # testes SQL, regras da extensão e isolamento pela API
  seed/                # TACO, IBGE, Open Food Facts, USDA, questionários, biblioteca de modelos, demo
  scripts/             # isolation-test.sh, metrics.sh
directus/extensions/
  rafanutri/           # endpoints (index.js carrega notify, maternal, subscriptions, public-health,
                       #   clinical-dashboard e ai; os demais arquivos são regras puras)
  rafanutri-hooks/     # ganchos de gravação e e-mails em português
  templates/           # modelos de e-mail (Liquid)
docs/
```

Gerenciador: pnpm workspaces + Turborepo.

## Multi-tenant

- Toda tabela de negócio tem `organization_id`.
- Três camadas: permissões do Directus filtradas pela organização do usuário, ganchos e endpoints que conferem papel e organização, gatilhos no banco para as regras invioláveis.
- Papéis no consultório: `owner`, `nutritionist`, `assistant` (sem acesso clínico). Na UAN, papéis por unidade (RT, gestor, cozinheiro, estoquista, auditor), fora de `organization_members`.
- O paciente não lê coleção nenhuma: tudo passa por `/rafanutri/me/patient/*`, filtrado pelo registro ligado à conta.
- Módulos por plano (`apps/web/lib/modules/plans.ts`) e por contrato (`organizations.modules`); a extensão confere de novo (ex.: Gestão barrada no Gratuito, materno-infantil só no Profissional e na Clínica).
- Teste: `db/tests/api-isolation.test.mjs` (ou `db/scripts/isolation-test.sh`, sem token de admin).

Ver [ADR 0002](adr/0002-multi-tenant-rls.md) e [ADR 0008](adr/0008-backend-directus.md).

## Integrações

| Integração | Uso | Situação |
|---|---|---|
| Telegram (bot @RafanutriAvisosBot) | Avisos e lembretes ao paciente, cobrança para o owner e o admin | No ar (21/11/2026). Webhook registrado pela extensão |
| Resend (SMTP, domínio `brunokobi.tech`) | Recuperação de senha, convite e avisos importantes | No ar (20/11/2026) |
| OpenRouter | Assistente de IA (pergunta livre, ideias de receitas, resumo da anamnese, sugestão de cardápio) | No ar, só modelos gratuitos; cota diária por plano |
| Pix (BR Code) | Assinatura da plataforma, sem gateway: o admin confirma o pagamento | No ar (21/11/2026) |
| Google AdSense | Anúncios não personalizados no plano Gratuito, só em telas sem dado de paciente | No ar |
| WhatsApp | Só links manuais (`wa.me`) para o nutricionista enviar; envio automático descartado | — |
| Gateway de pagamento | Baixa automática | Não planejado no MVP |
| Google Calendar | Sincronizar agenda | Pendente (RN-058) |

## Ambientes

Só existe **produção**. Não há staging.

| Ambiente | Web | Backend | Dados |
|---|---|---|---|
| Local | `pnpm dev` | Directus de produção (`rafanutri-api.brunokobi.tech`) | Usuário de teste e seed de demonstração |
| Produção | Coolify na vpsrafa (`rafanutri-web`) | Directus + Postgres em `~/apps/rafanutri-directus/` na vpsrafa | Reais |

Deploy manual:

- **Web:** push no GitHub e deploy disparado no Coolify (o webhook automático está pendente). Ver [runbook](runbooks/deploy-web-coolify.md).
- **Extensões:** cópia de `directus/extensions/` para a VPS (`chmod -R a+rX`) e `docker compose restart directus`.
- **Migrações:** `pg_dump` antes e `psql` dentro do contêiner. Ver [db/README](../db/README.md).

## Infraestrutura (vpsrafa)

VPS Oracle Cloud Always Free (ARM64, 2 OCPU, 12 GB, Frankfurt) com Coolify e Traefik, compartilhada com outros projetos.

- Containers `rafanutri-directus` e `rafanutri-postgres`; o Postgres não tem porta publicada.
- Traefik do Coolify na frente do web e do Directus; DNS no Cloudflare.
- Imagens com build **ARM64**.
- Backup diário do Postgres na VPS (00h de Brasília, 14 dias, conferido com `pg_restore --list`). **Falta a cópia fora da VPS.**
- Monitor externo de disponibilidade (UptimeRobot) pendente; ele também evita que a Oracle reclame a instância por ociosidade.
- A migração para serviços gerenciados no Brasil acontece quando um dos gatilhos do ADR 0004 ocorrer.
