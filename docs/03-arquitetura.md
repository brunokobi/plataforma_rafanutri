# 03 — Arquitetura

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
| Banco | Supabase Postgres | Migrações versionadas com Supabase CLI |
| Autenticação | Supabase Auth | E-mail/senha, Google, magic link para paciente |
| Arquivos | Supabase Storage | Buckets privados com URLs assinadas |
| Lógica de servidor | Server Actions do Next.js + Edge Functions | Cálculos sensíveis e integrações com IA ficam no servidor |
| Automação | n8n (self-hosted) | WhatsApp, e-mail, lembretes, rotinas |
| IA | API de LLM + pgvector | Chave de API somente no servidor |
| Testes | Vitest (unidade), Playwright (e2e) | Cálculos nutricionais com cobertura alta |
| CI/CD | GitHub Actions; deploy na Vercel | Ambientes: local, staging, produção |
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

| Ambiente | Supabase | Web |
|---|---|---|
| Local | Supabase CLI (Docker) | `pnpm dev` |
| Staging | Projeto Supabase separado | Preview da Vercel |
| Produção | Projeto Supabase de produção (região São Paulo) | Vercel produção |

Migrações e deploy em produção só por pipeline, com aprovação manual.
