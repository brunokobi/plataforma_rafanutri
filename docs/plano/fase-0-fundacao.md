# Fase 0 — Fundação

## Objetivo

Deixar pronta a base técnica, de segurança e de dados sobre a qual todos os módulos serão construídos: monorepo, Supabase, autenticação, organizações com papéis, isolamento por RLS, auditoria, base de alimentos e pipeline de CI/CD.

## Escopo / Fora de escopo

**Escopo**
- Estrutura do monorepo e ferramentas de qualidade (lint, format, typecheck, testes).
- Supabase local, staging e produção (produção só criado, sem clientes).
- Autenticação do profissional, onboarding da organização, convites e papéis.
- RLS base e testes de isolamento.
- Auditoria de acesso.
- Importação das bases TACO e, se a licença permitir, TBCA.
- Layout base do painel e identidade visual inicial.
- CI/CD, observabilidade e gestão de segredos.
- Validações regulatórias e documentos legais (rascunho).

**Fora de escopo**
- Qualquer tela clínica (Fase 1).
- Login do paciente (Fase 3).
- Cobrança (Fase 2).

## Pré-requisitos

- Conta GitHub com o repositório `plataforma_rafanutri`.
- Acesso ao Coolify da vpsrafa, onde roda todo o MVP ([ADR 0004](../adr/0004-infraestrutura-hospedagem.md)); medição prévia de CPU e memória livres.
- Conta no Sentry e provedor de e-mail transacional.
- Bucket externo para backups (Object Storage da Oracle ou Cloudflare R2).
- Domínio registrado (ex.: `rafanutri.com.br`).
- Acesso aos arquivos oficiais da TACO e da TBCA.

## Estrutura do monorepo

```
plataforma_rafanutri/
├─ apps/
│  └─ web/                     # Next.js (App Router)
│     ├─ app/
│     │  ├─ (auth)/            # login, cadastro, recuperar senha
│     │  ├─ (app)/             # área logada do profissional
│     │  │  ├─ [orgSlug]/      # rotas por organização
│     │  │  └─ onboarding/
│     │  └─ api/               # route handlers (webhooks)
│     ├─ components/
│     ├─ lib/
│     │  ├─ supabase/          # clients: browser, server, middleware
│     │  └─ auth/
│     └─ middleware.ts
├─ packages/
│  ├─ nutrition-core/          # cálculos puros (sem I/O)
│  ├─ db/                      # tipos gerados + queries tipadas
│  ├─ ui/                      # componentes shadcn customizados
│  └─ config/                  # eslint, tsconfig, tailwind preset
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  ├─ functions/
│  ├─ seed.sql
│  └─ tests/                   # testes de RLS (pgTAP)
├─ scripts/
│  └─ import-foods/            # importadores TACO/TBCA
├─ n8n/workflows/
├─ docs/
├─ .github/workflows/
├─ .env.example
├─ package.json / pnpm-workspace.yaml / turbo.json
```

## Modelo de dados

```sql
-- Enum de papéis
create type org_role as enum ('owner', 'nutritionist', 'assistant');
create type org_type as enum ('solo', 'clinic', 'company');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  type org_type not null default 'solo',
  document text,                       -- CPF ou CNPJ
  logo_path text,
  brand_color text default '#2E7D32',
  plan text not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  crn text,                            -- número do CRN
  crn_region text,                     -- ex.: 'CRN-9'
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role org_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create table organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role org_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references organizations(id),
  actor_id uuid,                       -- auth.uid() ou null para sistema
  action text not null,                -- insert | update | delete | read | export
  entity text not null,                -- nome da tabela
  entity_id uuid,
  diff jsonb,                          -- campos alterados (sem conteúdo clínico completo)
  ip inet,
  user_agent text,
  occurred_at timestamptz not null default now()
);
create index on audit_logs (organization_id, occurred_at desc);
create index on audit_logs (entity, entity_id);

-- Base de alimentos
create table food_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- TACO, TBCA, CUSTOM
  name text not null,
  version text,
  license_notes text,
  citation text
);

create table nutrients (
  id smallint primary key,
  code text not null unique,           -- energy_kcal, protein_g...
  name_pt text not null,
  unit text not null,                  -- kcal, g, mg, mcg
  display_order smallint not null
);

create table foods (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references food_sources(id),
  organization_id uuid references organizations(id),  -- null = base pública
  source_code text,                    -- código original na tabela de origem
  name text not null,
  food_group text,
  household_measures jsonb not null default '[]',      -- [{label, grams}]
  search_vector tsvector generated always as (to_tsvector('portuguese', unaccent_immutable(name))) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on foods using gin (search_vector);
create index on foods using gin (name gin_trgm_ops);

create table food_nutrients (
  food_id uuid not null references foods(id) on delete cascade,
  nutrient_id smallint not null references nutrients(id),
  amount_per_100g numeric(12,4),       -- null = não analisado; 0 = traço/zero
  is_trace boolean not null default false,
  primary key (food_id, nutrient_id)
);
```

### Funções auxiliares de RLS

```sql
create or replace function is_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and profile_id = auth.uid()
  );
$$;

create or replace function has_role(org uuid, roles org_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and profile_id = auth.uid() and role = any(roles)
  );
$$;
```

### Políticas principais

| Tabela | select | insert | update | delete |
|---|---|---|---|---|
| `organizations` | `is_member(id)` | via função `create_organization()` | `has_role(id, '{owner}')` | ninguém (soft delete futuro) |
| `profiles` | próprio perfil ou membro da mesma organização | próprio (`id = auth.uid()`) | próprio | ninguém |
| `organization_members` | `is_member(organization_id)` | via aceite de convite | `owner` | `owner` (não remove o último owner) |
| `organization_invites` | `owner` | `owner` | ninguém | `owner` |
| `audit_logs` | `owner` da organização | apenas gatilhos (`security definer`) | ninguém | ninguém |
| `foods` | autenticado e (`organization_id is null` ou `is_member`) | `nutritionist`/`owner` com `organization_id` próprio | idem | idem |
| `food_nutrients` | segue `foods` | segue `foods` | segue `foods` | segue `foods` |
| `food_sources`, `nutrients` | autenticado | ninguém (só migração) | ninguém | ninguém |

## Rotas e telas

| Rota | Tela | Acesso |
|---|---|---|
| `/login` | Login (e-mail/senha, Google) | Público |
| `/cadastro` | Criar conta (nome, e-mail, senha, aceite de termos) | Público |
| `/recuperar-senha` e `/redefinir-senha` | Recuperação de senha | Público |
| `/convite/[token]` | Aceitar convite | Público → autentica |
| `/onboarding` | Criar organização (nome, tipo, CRN, logo, cor) | Autenticado sem organização |
| `/[orgSlug]` | Painel inicial (vazio com atalhos) | Membro |
| `/[orgSlug]/configuracoes/organizacao` | Dados, logo, cor | `owner` |
| `/[orgSlug]/configuracoes/equipe` | Membros e convites | `owner` |
| `/[orgSlug]/configuracoes/perfil` | Dados pessoais e CRN | Membro |
| `/[orgSlug]/alimentos` | Busca na base de alimentos (somente leitura nesta fase) | Membro |

## Itens do backlog

### RN-001 — Criar monorepo (pnpm + Turborepo)
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** —
- **Descrição:** estrutura inicial do repositório conforme a árvore acima, com ferramentas de qualidade compartilhadas.
- **Tarefas técnicas:**
  - [ ] `pnpm init`, `pnpm-workspace.yaml` com `apps/*` e `packages/*`
  - [ ] `turbo.json` com pipelines `dev`, `build`, `lint`, `typecheck`, `test`
  - [ ] `packages/config`: tsconfig base (strict), ESLint (flat config), Prettier
  - [ ] Criar `packages/nutrition-core` com Vitest e um teste de exemplo
  - [ ] Criar `packages/db` e `packages/ui` vazios com build
  - [ ] `.nvmrc` (Node LTS), `.editorconfig`, `.gitignore`, `.env.example`
  - [ ] Husky + lint-staged (lint e format no pre-commit) e commitlint (Conventional Commits)
- **Arquivos/áreas:** raiz, `packages/config`, `packages/nutrition-core`
- **Critérios de aceite:**
  - Dado um clone novo, quando rodo `pnpm i && pnpm build && pnpm test`, então tudo passa sem erro.
  - Dado um commit fora do padrão, quando tento commitar, então o commitlint bloqueia.
- **Testes:** execução do pipeline no CI (RN-014).

### RN-002 — Configurar Next.js com TypeScript, Tailwind e shadcn/ui
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-001
- **Descrição:** app web com App Router, estilos e biblioteca de componentes.
- **Tarefas técnicas:**
  - [ ] `apps/web` com Next.js, App Router, `src` opcional, alias `@/`
  - [ ] Tailwind com preset em `packages/config`
  - [ ] shadcn/ui inicializado; componentes base (button, input, form, dialog, dropdown, table, toast, tabs, card, badge, skeleton)
  - [ ] Fonte (ex.: Inter) via `next/font`
  - [ ] React Hook Form + Zod + `@hookform/resolvers`
  - [ ] TanStack Query para cache de dados no cliente
  - [ ] Página `/` de saúde e página 404
- **Arquivos/áreas:** `apps/web`, `packages/ui`
- **Critérios de aceite:**
  - Quando rodo `pnpm dev`, então a aplicação abre em `localhost:3000` com o tema aplicado.
- **Testes:** build no CI.

### RN-003 — Configurar Supabase local e na VPS
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-001
- **Descrição:** ambiente local com Supabase CLI (Docker) e Supabase self-hosted na vpsrafa, com instâncias separadas de staging e produção e backup diário externo.
- **Tarefas técnicas:**
  - [ ] `supabase init`; ajustar `config.toml` (auth, e-mail local com Inbucket, URLs de redirect)
  - [ ] Habilitar extensões `pgcrypto`, `pg_trgm`, `unaccent`, `citext`
  - [ ] Função `unaccent_immutable` para índices de busca
  - [ ] Subir Supabase self-hosted pelo template do Coolify (staging e produção separados), imagens ARM64, rede Docker própria
  - [ ] Gerar `JWT_SECRET`, `ANON_KEY` e `SERVICE_ROLE_KEY` próprios por ambiente e guardá-los no Coolify
  - [ ] Expor só a API (Kong) e o Auth pelo Traefik; Studio e Postgres sem acesso público
  - [ ] Desligar serviços não usados no MVP (ex.: Realtime) para economizar memória
  - [ ] Backup diário com `pg_dump` (e dos arquivos do Storage) para o bucket externo, retenção de 14 dias, alerta em caso de falha
  - [ ] Testar a restauração do backup num banco limpo e documentar o passo a passo
  - [ ] Script `pnpm db:types` gerando tipos para `packages/db`
  - [ ] Clients Supabase em `apps/web/lib/supabase` (browser, server com cookies, middleware) usando `@supabase/ssr`
  - [ ] Documentar no README como subir o ambiente
- **Arquivos/áreas:** `supabase/`, `apps/web/lib/supabase`, `packages/db`
- **Critérios de aceite:**
  - Dado Docker instalado, quando rodo `pnpm db:start`, então o Supabase local sobe e as migrações são aplicadas.
  - Quando rodo `pnpm db:types`, então `packages/db/src/database.types.ts` é atualizado.
  - Dado o backup da noite anterior, quando restauro num banco limpo, então os dados aparecem completos.
- **Testes:** CI aplica as migrações em um Supabase efêmero.

### RN-004 — Migração: organizações, perfis, membros e auditoria
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-003
- **Descrição:** tabelas `organizations`, `profiles`, `organization_members`, `organization_invites`, `audit_logs` e funções auxiliares, conforme o modelo acima.
- **Tarefas técnicas:**
  - [ ] Migração com enums, tabelas, índices e gatilho `updated_at`
  - [ ] Gatilho em `auth.users` que cria `profiles` no cadastro
  - [ ] Funções `is_member` e `has_role`
  - [ ] Função `create_organization(name, type, ...)` que cria a organização e o membro `owner` na mesma transação
  - [ ] Geração de `slug` único a partir do nome
- **Arquivos/áreas:** `supabase/migrations`
- **Critérios de aceite:**
  - Quando um usuário se cadastra, então existe um `profiles` com o mesmo id.
  - Quando chamo `create_organization`, então a organização e o vínculo `owner` são criados atomicamente.
- **Testes:** pgTAP para gatilhos e funções.

### RN-005 — Autenticação: e-mail/senha, Google e recuperação de senha
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-002, RN-004
- **Descrição:** telas e fluxos de autenticação do profissional.
- **Tarefas técnicas:**
  - [ ] Telas `/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`
  - [ ] OAuth Google configurado (local e staging)
  - [ ] Confirmação de e-mail obrigatória
  - [ ] Política de senha (mínimo 8 caracteres, verificação contra senhas vazadas do Supabase)
  - [ ] `middleware.ts` renovando sessão e protegendo rotas de `(app)`
  - [ ] Templates de e-mail em português com a marca
  - [ ] Limite de tentativas (rate limit do Supabase Auth) e mensagens de erro neutras
  - [ ] Aceite dos Termos de Uso e da Política de Privacidade no cadastro (registro de versão e data)
- **Arquivos/áreas:** `apps/web/app/(auth)`, `apps/web/middleware.ts`, `supabase/templates`
- **Critérios de aceite:**
  - Dado um usuário não autenticado, quando acessa `/[orgSlug]`, então é redirecionado para `/login`.
  - Dado e-mail não confirmado, quando tenta entrar, então recebe orientação para confirmar.
  - Quando peço recuperação de senha, então recebo e-mail e consigo definir nova senha.
- **Testes:** e2e (Playwright) de cadastro, login, logout e recuperação usando o Inbucket local.

### RN-006 — Onboarding: criar organização no primeiro acesso
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-005
- **Descrição:** assistente em 2 passos: dados do profissional (nome, CRN, região) e dados da organização (nome, tipo, logo, cor).
- **Tarefas técnicas:**
  - [ ] Tela `/onboarding` com validação Zod (formato de CRN por região)
  - [ ] Upload de logo para o bucket privado `org-assets` (PNG/JPG/SVG até 2 MB)
  - [ ] Redirecionar usuário sem organização para o onboarding
  - [ ] Seletor de organização no cabeçalho para quem participa de mais de uma
- **Arquivos/áreas:** `apps/web/app/(app)/onboarding`, `supabase/migrations` (bucket e políticas de storage)
- **Critérios de aceite:**
  - Dado um usuário recém-cadastrado, quando conclui o onboarding, então cai no painel `/[slug]` da nova organização como `owner`.
- **Testes:** e2e do fluxo; teste de política de storage.

### RN-007 — Convite de membros e papéis
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-006
- **Descrição:** o `owner` convida pessoas por e-mail com papel `nutritionist` ou `assistant`, altera papéis e remove membros.
- **Tarefas técnicas:**
  - [ ] Tela `/[orgSlug]/configuracoes/equipe` com lista de membros e convites pendentes
  - [ ] Server Action que gera token aleatório, guarda só o hash e envia e-mail (validade de 7 dias)
  - [ ] Rota `/convite/[token]`: se não autenticado, cadastro/login e depois aceite; se e-mail divergente, bloquear
  - [ ] Reenviar e cancelar convite
  - [ ] Impedir remover ou rebaixar o último `owner`
  - [ ] Hook `useCurrentMembership()` com organização e papel atuais
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/configuracoes/equipe`, `apps/web/app/convite`, `supabase/migrations`
- **Critérios de aceite:**
  - Dado um convite válido, quando o convidado aceita, então ele aparece na equipe com o papel definido.
  - Dado um convite expirado ou já usado, quando é aberto, então aparece mensagem de convite inválido.
  - Dado um `assistant`, quando tenta abrir a tela de equipe, então recebe acesso negado.
- **Testes:** unidade do gerador de token; pgTAP das políticas; e2e de convite e aceite.

### RN-008 — Políticas RLS base e testes de isolamento
- **Tipo:** infra
- **Pontos:** 5
- **Depende de:** RN-004
- **Descrição:** habilitar RLS em todas as tabelas, escrever políticas e criar a suíte de testes que garante o isolamento entre organizações. Essa suíte cresce a cada nova tabela.
- **Tarefas técnicas:**
  - [ ] `alter table ... enable row level security` em todas as tabelas de `public`
  - [ ] Políticas conforme a tabela de políticas acima
  - [ ] pgTAP: helpers para autenticar como usuário de teste (`set local role authenticated` + `request.jwt.claims`)
  - [ ] Cenários: usuário A não lê/escreve dados da organização B; `assistant` sem acesso a tabelas clínicas; anônimo sem acesso
  - [ ] Verificação no CI: consulta em `pg_tables` falha se alguma tabela de `public` estiver sem RLS
  - [ ] Documentar o padrão de política em `docs/` para as próximas tabelas
- **Arquivos/áreas:** `supabase/migrations`, `supabase/tests`
- **Critérios de aceite:**
  - Quando rodo `pnpm db:test`, então todos os cenários de isolamento passam.
  - Dado uma migração que cria tabela sem RLS, quando o CI roda, então o pipeline falha.
- **Testes:** pgTAP.

### RN-009 — Gatilhos de auditoria para tabelas sensíveis
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-004
- **Descrição:** função genérica `audit_trigger()` que grava em `audit_logs` inserções, alterações e exclusões; tabelas clínicas da Fase 1 passam a usá-la. Leituras de prontuário são registradas pela aplicação via função `log_access(entity, entity_id)`.
- **Tarefas técnicas:**
  - [ ] Função `audit_trigger()` (`security definer`) gravando ator, ação, entidade, id e lista de campos alterados (sem valores clínicos completos)
  - [ ] Função RPC `log_access` para eventos de leitura e exportação
  - [ ] Tela simples `/[orgSlug]/configuracoes/auditoria` para o `owner` (filtros por data, usuário, entidade)
  - [ ] Política de retenção documentada (a definir com jurídico)
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/configuracoes/auditoria`
- **Critérios de aceite:**
  - Quando um registro auditado é alterado, então existe uma linha em `audit_logs` com o autor e os campos alterados.
  - Quando um `nutritionist` tenta ler `audit_logs`, então não vê nada.
- **Testes:** pgTAP.

### RN-010 — Migração da base de alimentos
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-003
- **Descrição:** tabelas `food_sources`, `nutrients`, `foods`, `food_nutrients` com busca por texto sem acento e por semelhança.
- **Tarefas técnicas:**
  - [ ] Migração conforme o modelo
  - [ ] Seed de `nutrients` com a lista padronizada (energia, proteína, lipídios, carboidrato, fibra, cálcio, ferro, sódio, potássio, magnésio, zinco, vitaminas A, C, D, B12, colesterol, gorduras saturadas, mono e poli-insaturadas, açúcares quando houver)
  - [ ] Função RPC `search_foods(query, org_id, limit)` combinando `tsvector` e `pg_trgm`, priorizando base própria e TACO
  - [ ] Página `/[orgSlug]/alimentos` com busca e visualização da composição por 100 g
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/alimentos`
- **Critérios de aceite:**
  - Quando busco "feijao" (sem acento), então "Feijão, carioca, cozido" aparece entre os primeiros resultados.
  - A busca responde em menos de 200 ms no staging para a base completa.
- **Testes:** pgTAP da função de busca; teste de desempenho simples.

### RN-011 — Importação da TACO
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-010, RN-015
- **Descrição:** script idempotente que lê a TACO (4ª edição), normaliza os valores e grava em `foods`/`food_nutrients`.
- **Tarefas técnicas:**
  - [ ] Script em `scripts/import-foods/taco.ts` lendo o arquivo oficial (CSV/XLSX convertido) guardado no repositório ou em storage
  - [ ] Mapeamento de colunas para `nutrients.code`
  - [ ] Tratamento de valores especiais: `NA` (não analisado) → `null`; `Tr` (traço) → `0` com `is_trace = true`; `*` e campos vazios
  - [ ] Upsert por `source_code`, com verificação do total de alimentos importados
  - [ ] Registro da citação da fonte em `food_sources.citation`
  - [ ] Medidas caseiras iniciais para os alimentos mais comuns (lista curada com a nutricionista, ver RN-033)
- **Arquivos/áreas:** `scripts/import-foods`, `supabase/seed`
- **Critérios de aceite:**
  - Quando rodo o importador duas vezes, então o total de alimentos não duplica.
  - Uma amostra de 20 alimentos conferida manualmente contra a publicação original bate em todos os nutrientes.
- **Testes:** unidade do parser com amostra de linhas, incluindo `NA`, `Tr` e vazios.

### RN-012 — Importação da TBCA
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-010, RN-015
- **Descrição:** importar a TBCA se a licença permitir uso comercial; caso contrário, registrar a decisão e oferecer só TACO + base própria.
- **Tarefas técnicas:**
  - [ ] Conferir resultado de RN-015
  - [ ] Importador `scripts/import-foods/tbca.ts` no mesmo padrão da TACO
  - [ ] Regra de exibição quando o mesmo alimento existe nas duas bases (mostrar fonte no resultado)
- **Arquivos/áreas:** `scripts/import-foods`
- **Critérios de aceite:**
  - Dado licença compatível, quando importo, então os alimentos aparecem na busca identificados como TBCA.
- **Testes:** unidade do parser.

### RN-013 — Layout base do painel
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-002, RN-019
- **Descrição:** estrutura visual da área logada.
- **Tarefas técnicas:**
  - [ ] Menu lateral recolhível com seções: Início, Pacientes, Agenda, Alimentos, Financeiro (desabilitado), Configurações
  - [ ] Cabeçalho com seletor de organização, busca global (placeholder) e menu do usuário
  - [ ] Menu inferior no celular
  - [ ] Tema claro/escuro
  - [ ] Componentes de estado: vazio, carregando (skeleton), erro
  - [ ] Itens de menu ocultos conforme o papel
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/layout.tsx`, `packages/ui`
- **Critérios de aceite:**
  - Em 360 px de largura, a navegação funciona sem rolagem horizontal.
  - Um `assistant` não vê itens clínicos no menu.
- **Testes:** e2e de navegação em viewport de celular e de computador.

### RN-014 — CI/CD
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-001, RN-003
- **Descrição:** pipeline de qualidade e deploy.
- **Tarefas técnicas:**
  - [ ] GitHub Actions: instalar com cache do pnpm, lint, typecheck, testes unitários, build
  - [ ] Job de banco: subir Supabase no runner, aplicar migrações, rodar pgTAP e checar tabelas sem RLS
  - [ ] Job e2e com Playwright contra o build local (em PRs para `main`)
  - [ ] Staging e produção na vpsrafa via Coolify: aplicações ligadas ao GitHub, staging com deploy automático no merge em `main` (e previews por PR, se a memória permitir), `Dockerfile` multi-stage do Next.js (`output: 'standalone'`) com build ARM64
  - [ ] Rede Docker própria da Rafanutri; roteamento pelo Traefik existente com subdomínio de staging e TLS automático
  - [ ] Proteger o staging com autenticação básica ou allowlist (não indexável)
  - [ ] Produção: deploy só por tag, com migração aplicada antes do deploy
  - [ ] Incluir a URL de produção no monitor externo de disponibilidade
  - [ ] Workflow de migração para staging (automático) e produção (manual com aprovação, `environment` protegido)
  - [ ] `pnpm audit` e Dependabot
  - [ ] Proteção da `main`: PR obrigatório, CI verde, 1 aprovação
- **Arquivos/áreas:** `.github/workflows`
- **Critérios de aceite:**
  - Dado um PR, quando é aberto, então o CI roda todas as etapas e publica a URL de preview.
  - Quando há merge em `main`, então as migrações são aplicadas em staging.
- **Testes:** o próprio pipeline.

### RN-015 — Validações regulatórias e de licenças
- **Tipo:** pesquisa
- **Pontos:** 2
- **Depende de:** —
- **Descrição:** confirmar regras que afetam o produto antes de construir o módulo clínico.
- **Tarefas técnicas:**
  - [ ] Licença e termos de uso da TACO e da TBCA para uso comercial e redistribuição em software
  - [ ] Resoluções vigentes do CFN sobre prontuário (conteúdo mínimo, guarda, prontuário eletrônico)
  - [ ] Resolução vigente do CFN sobre atendimento não presencial
  - [ ] Requisitos de assinatura do plano alimentar e de documentos (eletrônica simples, avançada ou ICP-Brasil)
  - [ ] Registrar conclusões em `docs/05-seguranca-lgpd.md` e, se mudar a arquitetura, em um ADR
- **Arquivos/áreas:** `docs/`
- **Critérios de aceite:**
  - Cada item "A validar" de `05-seguranca-lgpd.md` está respondido com a fonte citada ou com responsável e prazo.
- **Testes:** —

### RN-016 — Termos de Uso, Política de Privacidade e DPA
> **Adiado para depois do MVP** (LGPD fora do escopo inicial, ver [ADR 0004](../adr/0004-infraestrutura-hospedagem.md)). Executar quando um gatilho de revisão do ADR ocorrer.

- **Tipo:** doc
- **Pontos:** 3
- **Depende de:** RN-015
- **Descrição:** rascunhos para revisão jurídica, com a Rafanutri como operadora dos dados de pacientes.
- **Tarefas técnicas:**
  - [ ] Termos de Uso (responsabilidades do profissional, uso da IA, disponibilidade)
  - [ ] Política de Privacidade (dados coletados, finalidades, subprocessadores, direitos do titular, encarregado)
  - [ ] Contrato de tratamento de dados (DPA) para clientes
  - [ ] Modelo de termo de consentimento do paciente (usado em RN-021)
  - [ ] Páginas públicas `/termos` e `/privacidade` com versão
- **Arquivos/áreas:** `docs/legal/`, `apps/web/app/(public)`
- **Critérios de aceite:**
  - Documentos publicados com número de versão e data; o cadastro registra a versão aceita.
- **Testes:** —

### RN-017 — Observabilidade e tratamento de erros
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-002
- **Descrição:** saber quando algo quebra em staging e produção sem expor dados sensíveis.
- **Tarefas técnicas:**
  - [ ] Sentry no Next.js (cliente e servidor) com `beforeSend` removendo dados pessoais e corpo de requisições
  - [ ] Páginas de erro amigáveis (`error.tsx`, `global-error.tsx`)
  - [ ] Logger estruturado no servidor (sem dados de paciente)
  - [ ] Alertas por e-mail para picos de erro
  - [ ] Monitor de disponibilidade (uptime) para staging e produção
- **Arquivos/áreas:** `apps/web/instrumentation.ts`, `apps/web/sentry.*.config.ts`
- **Critérios de aceite:**
  - Dado um erro forçado em staging, quando ocorre, então aparece no Sentry sem nome, e-mail ou CPF.
- **Testes:** teste unitário do filtro `beforeSend`.

### RN-018 — Gestão de segredos e variáveis de ambiente
- **Tipo:** infra
- **Pontos:** 1
- **Depende de:** RN-003
- **Descrição:** padronizar onde ficam chaves e como cada ambiente recebe as suas.
- **Tarefas técnicas:**
  - [ ] `.env.example` com todas as variáveis, sem valores reais e com descrição
  - [ ] Validação das variáveis na inicialização com Zod (`apps/web/lib/env.ts`), separando públicas (`NEXT_PUBLIC_*`) e de servidor
  - [ ] Variáveis no Coolify (staging e produção) e nos secrets do GitHub, por ambiente
  - [ ] Segredos da Rafanutri nunca no repositório de recuperação da VPS nem em arquivos `.env` versionados
  - [ ] Regra de lint impedindo import de `env` de servidor em componentes de cliente
- **Arquivos/áreas:** `.env.example`, `apps/web/lib/env.ts`
- **Critérios de aceite:**
  - Sem uma variável obrigatória, quando a aplicação inicia, então falha com mensagem clara do que falta.
- **Testes:** unidade do schema de env.

### RN-019 — Identidade visual e design system inicial
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-002
- **Descrição:** definir a aparência da Rafanutri e transformá-la em tokens e componentes.
- **Tarefas técnicas:**
  - [ ] Logotipo, paleta (primária, neutros, estados), tipografia e ícones (Lucide)
  - [ ] Tokens no preset do Tailwind (cores, raios, sombras, espaçamentos)
  - [ ] Telas-chave no Figma: login, onboarding, painel, lista de pacientes, editor de plano (esboço)
  - [ ] Página interna `/dev/ui` com os componentes (só em desenvolvimento)
  - [ ] Verificação de contraste (WCAG AA)
- **Arquivos/áreas:** `packages/config/tailwind`, `packages/ui`
- **Critérios de aceite:**
  - Componentes base usam apenas tokens, sem cores fixas no código.
- **Testes:** revisão visual.

## Sequência semanal (2 desenvolvedores)

| Semana | Dev A | Dev B |
|---|---|---|
| 1 | RN-001, RN-002, RN-018 | RN-003, RN-004, RN-015 (com a nutricionista) |
| 2 | RN-005, RN-006, RN-019 | RN-008, RN-009, RN-010 |
| 3 | RN-007, RN-013, RN-017 | RN-011, RN-012, RN-014, RN-016 |

## Critério de pronto da fase

- Um usuário cria conta, faz o onboarding, convida um assistente e um nutricionista.
- A suíte de RLS prova que outra organização não acessa nada, e o CI bloqueia tabela sem RLS.
- A busca de alimentos funciona sobre a TACO importada e conferida.
- Merge em `main` publica em staging automaticamente.
- Itens regulatórios de RN-015 respondidos ou com responsável e prazo.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Licença da TBCA não permitir uso comercial | Seguir só com TACO + base própria; buscar autorização formal |
| Políticas RLS complexas ficarem lentas | Funções `stable security definer`, índices em `organization_members(profile_id)`, medir com `explain analyze` |
| Configuração de auth diferente entre ambientes | `config.toml` versionado e checklist de configuração de staging/produção |

## Métricas a acompanhar

- Tempo do pipeline de CI (meta: menos de 10 minutos).
- Cobertura de testes de RLS (todas as tabelas com ao menos um teste de isolamento).
- Tempo de resposta da busca de alimentos (p95 abaixo de 200 ms).
