# 03 — Arquitetura

> **Backend: Directus** ([ADR 0008](adr/0008-backend-directus.md)). Onde este documento cita Supabase, RLS, `auth.uid()`, Storage ou Edge Functions, leia pela tabela de equivalência do ADR 0008.

## Visão geral

```
                ┌────────────────────────┐      ┌──────────────────────┐
 Nutricionista →│  Web App (Next.js)     │      │  App do paciente     │← Paciente
                │  painel profissional   │      │  (PWA → Expo depois) │
                └──────────┬─────────────┘      └──────────┬───────────┘
                           │  supabase-js / Server Actions │
                           ▼                               ▼
                ┌──────────────────────────────────────────────────────┐
                │                     Supabase                         │
                │  Auth · Postgres (RLS) · Storage · Edge Functions    │
                │  pgvector (RAG) · Realtime (chat) · pg_cron          │
                └──────────┬──────────────────────────────┬────────────┘
                           │ webhooks / DB triggers       │ API
                           ▼                              ▼
                ┌──────────────────────┐       ┌──────────────────────┐
                │        n8n           │       │   Provedor de LLM    │
                │ lembretes, WhatsApp, │       │ (sugestões, resumos, │
                │ e-mails, rotinas     │       │  embeddings)         │
                └──────────────────────┘       └──────────────────────┘
```

## Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend web | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui | Painel do nutricionista e PWA do paciente no mesmo projeto |
| Formulários e validação | React Hook Form + Zod | Schemas Zod compartilhados entre front e Edge Functions |
| Gráficos | Recharts | Evolução antropométrica, curvas OMS |
| PDF | Geração no servidor (React PDF ou Playwright) | Plano alimentar, recibos, relatórios |
| Banco | Supabase Postgres (self-hosted no MVP) | Migrações versionadas com Supabase CLI |
| Autenticação | Supabase Auth | E-mail/senha, Google, magic link para paciente |
| Arquivos | Supabase Storage | Buckets privados com URLs assinadas |
| Lógica de servidor | Server Actions do Next.js + Edge Functions | Cálculos sensíveis e integrações com IA ficam no servidor |
| Automação | n8n (self-hosted) | WhatsApp, e-mail, lembretes, rotinas |
| IA | API de LLM + pgvector | Chave de API somente no servidor |
| Testes | Vitest (unidade), Playwright (e2e) | Cálculos nutricionais com cobertura alta |
| CI/CD | GitHub Actions; deploy de staging e produção na vpsrafa via Coolify | Ver [ADR 0004](adr/0004-infraestrutura-hospedagem.md) |
| Observabilidade | Sentry + logs do Supabase | |

## Organização do código (monorepo proposto)

```
apps/
  web/                 # Next.js: painel profissional + PWA do paciente
packages/
  nutrition-core/      # cálculos puros em TS: GET, antropometria, composição, nutrientes, OMS
  db/                  # tipos gerados do Supabase e helpers de acesso
  ui/                  # componentes compartilhados
supabase/
  migrations/          # SQL versionado
  functions/           # Edge Functions
  seed/                # TACO/TBCA, dados de demonstração
n8n/
  workflows/           # exportações JSON dos fluxos
docs/
```

Gerenciador: pnpm workspaces + Turborepo.

O pacote `nutrition-core` concentra toda fórmula nutricional como funções puras, sem dependência de banco ou UI. Isso permite testar cada fórmula contra exemplos da literatura e reaproveitar no app nativo depois.

## Multi-tenant

- Toda tabela de negócio tem `organization_id`.
- Acesso controlado por **Row Level Security** no Postgres, a partir da associação do usuário à organização (`organization_members`) e do seu papel.
- Papéis iniciais: `owner`, `nutritionist`, `assistant` (recepção, sem acesso clínico), `patient`.
- Pacientes acessam somente os próprios dados publicados pelo nutricionista.

Ver [ADR 0002](adr/0002-multi-tenant-rls.md).

## Integrações

| Integração | Uso | Fase |
|---|---|---|
| WhatsApp (API oficial do WhatsApp Business via provedor, orquestrada no n8n) | Lembretes, envio de link de anamnese | 2 |
| E-mail transacional (Resend ou similar) | Convites, recuperação de senha, lembretes | 0 |
| Google Calendar | Sincronizar agenda do profissional | 2 |
| Gateway de pagamento (Asaas, Mercado Pago ou Stripe) | Assinatura do SaaS e cobrança de pacientes | 2 |
| LLM | Sugestão de cardápio, resumos, RAG | 3 |

## Ambientes

Decisão completa em [ADR 0004](adr/0004-infraestrutura-hospedagem.md). No MVP, tudo roda na VPS existente (vpsrafa).

| Ambiente | Supabase | Web | n8n | Dados |
|---|---|---|---|---|
| Local | Supabase CLI (Docker) | `pnpm dev` | Container local opcional | Seed sintético |
| Staging | Self-hosted na vpsrafa | Coolify na vpsrafa (deploy de `main`) | Instância dedicada da Rafanutri | Seed sintético |
| Produção (MVP) | Self-hosted na vpsrafa, banco separado do staging | Coolify na vpsrafa (deploy por tag) | Mesma instância dedicada | Reais |

Migrações e deploy em produção só por pipeline, com aprovação manual. Backup diário do Postgres para um bucket fora da VPS.

## Infraestrutura do MVP (vpsrafa)

VPS Oracle Cloud Always Free (ARM64, 2 OCPU, 12 GB, Frankfurt) com Coolify e Traefik, compartilhada com outros projetos.

- **Supabase self-hosted** pelo template do Coolify; Studio e Postgres sem acesso público.
- **n8n dedicado** da Rafanutri, separado do n8n pessoal.
- **WhatsApp** pela Evolution API; **IA** pelo OpenRouter com fallback entre modelos `:free`.
- Containers da Rafanutri em rede Docker própria; só o Traefik é compartilhado.
- Imagens com build **ARM64** (ex.: `pgvector/pgvector:pg16`).
- Monitor externo de disponibilidade obrigatório, para evitar que a Oracle reclame a instância por ociosidade.
- A migração para serviços gerenciados no Brasil acontece quando um dos gatilhos do ADR 0004 ocorrer.
