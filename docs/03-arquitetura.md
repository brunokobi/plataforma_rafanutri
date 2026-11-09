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
| CI/CD | GitHub Actions; staging na VPS via Coolify; produção em hospedagem no Brasil | Ver [ADR 0004](adr/0004-infraestrutura-hospedagem.md) |
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

Decisão completa em [ADR 0004](adr/0004-infraestrutura-hospedagem.md).

| Ambiente | Supabase | Web | n8n | Dados |
|---|---|---|---|---|
| Local | Supabase CLI (Docker) | `pnpm dev` | Container local opcional | Seed sintético |
| Staging | Supabase Cloud, projeto gratuito | **VPS existente via Coolify** (deploy de `main` e previews por PR) | Instância dedicada da Rafanutri na VPS | Seed sintético |
| Produção | Supabase Cloud Pro, região São Paulo | Vercel Pro (região `gru1`) ou VPS paga no Brasil | Instância dedicada (dados mínimos) | Reais |

Migrações e deploy em produção só por pipeline, com aprovação manual.

## Infraestrutura existente (VPS)

Uma VPS Oracle Cloud (ARM64, 2 OCPU, 12 GB, Frankfurt) com Coolify e Traefik já está em operação e compartilha a máquina com outros projetos. Uso na Rafanutri:

- **Sim:** staging, previews, demonstrações comerciais, n8n dedicado da Rafanutri, utilitários sem dado de paciente.
- **Não:** banco ou arquivos com dados reais de pacientes, nem chaves de produção guardadas fora do Coolify ou dos secrets do CI.
- Os containers da Rafanutri ficam em rede Docker própria; só o Traefik é compartilhado.
- Imagens precisam ter build **ARM64** (ex.: `pgvector/pgvector:pg16`); o Next.js roda em ARM sem ajuste.
- O monitor externo de disponibilidade continua obrigatório para evitar que a Oracle reclame a instância por ociosidade.
