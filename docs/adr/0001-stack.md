# ADR 0001 — Stack inicial

- **Status:** proposto
- **Data:** 2026-11-09

## Contexto

Equipe pequena, necessidade de chegar rápido a um MVP vendável, dados sensíveis de saúde e familiaridade prévia com Supabase, n8n e IA.

## Decisão

- **Next.js + TypeScript** para o painel web e o PWA do paciente.
- **Supabase** como backend: Postgres com RLS, Auth, Storage, Edge Functions e pgvector.
- **n8n** para automações e integrações de mensageria.
- **Monorepo** com pnpm + Turborepo; cálculos nutricionais em pacote TypeScript puro (`nutrition-core`).
- Hospedagem do front e do staging conforme o [ADR 0004](0004-infraestrutura-hospedagem.md): staging na VPS existente (Coolify); produção perto de São Paulo (Vercel Pro ou VPS paga); Supabase de produção na região São Paulo.

## Consequências

- Menos infraestrutura para manter; foco no domínio.
- Segurança depende de políticas RLS bem escritas e testadas.
- Dependência de fornecedor (Supabase e hospedagem) mitigada por ser Postgres padrão e Next.js portável.
- Regras de negócio complexas ficam em Server Actions/Edge Functions, não no cliente.
