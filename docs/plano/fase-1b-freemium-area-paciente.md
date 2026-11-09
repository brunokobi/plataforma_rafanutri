# Fase 1B — Plano gratuito e área do paciente

## Objetivo

Lançar o MVP com um **plano gratuito**. Cada nutricionista (o tenant) usa a Rafanutri sem pagar com até **20 pacientes ativos**, e cada paciente tem uma **área própria** onde vê o plano alimentar publicado, as receitas e as recomendações que o nutricionista compartilhou.

Essa fase traz para o MVP a base do acesso do paciente que estava na Fase 3. A Fase 3 passa a evoluir essa área para um PWA completo (instalação, offline, diário, hidratação, push e IA).

## Conceitos

| Conceito | Na plataforma |
|---|---|
| **Tenant** | `organizations`. Um nutricionista autônomo é uma organização do tipo `solo`; uma clínica é uma organização com vários membros. Todos os dados de negócio têm `organization_id` e são isolados por RLS. |
| **Nutricionista** | `profiles` + `organization_members` (papéis `owner`, `nutritionist`, `assistant`). |
| **Paciente** | `patients`, sempre dentro de uma organização. Pode ter login próprio (`patients.auth_user_id`). Uma mesma pessoa atendida por dois nutricionistas tem dois registros, um em cada organização, ligados ao mesmo usuário de login. |
| **Plano da organização** | `plans` + `subscriptions`. No MVP só existe o plano `free`. |
| **Paciente ativo** | `patients.status = 'active'`. Arquivar libera a vaga. |

## Regras do plano gratuito

| Regra | Valor no MVP |
|---|---|
| Pacientes ativos | Até **20** por organização (`plans.max_active_patients`, configurável) |
| Pacientes arquivados | Ilimitados; perdem o acesso à área do paciente enquanto arquivados |
| Membros da organização | 1 nutricionista (`max_members = 1`) |
| Área do paciente | Incluída, sem custo para o paciente |
| Receitas e recomendações | Ilimitadas |
| IA | Cota diária pequena, definida na Fase 3 (RN-077) |
| Prazo | Permanente (não é trial) |

- O limite vale no **banco** (gatilho), não só na tela. Assim nenhuma rota ou integração consegue passar dele.
- Quando o limite é atingido, o nutricionista pode arquivar pacientes ou entrar na lista de interesse do plano pago. A cobrança vem na Fase 2 (RN-057).
- Reativar um paciente arquivado ocupa uma vaga como qualquer outro.

## Escopo / Fora de escopo

**Escopo**
- Planos e assinaturas mínimos (só `free`), limites e contador de uso.
- Convite do paciente, login por link mágico e vínculo da conta.
- Área do paciente responsiva (web mobile): início, plano alimentar, receitas, recomendações e PDFs.
- Receitas com foto, modo de preparo, tempo e porções, compartilháveis com o paciente.
- Recomendações publicadas para o paciente, com marcação de lidas.
- Configuração do que o paciente pode ver (calorias, evolução de peso).
- Paciente com mais de um nutricionista.

**Fora de escopo (Fase 3)**
- PWA instalável, offline e push (RN-074, RN-078).
- Diário alimentar, hidratação e lista de compras (RN-072, RN-073).
- Painel de adesão (RN-080) e IA.

**Fora de escopo (Fase 2)**
- Planos pagos, checkout e cobrança (RN-057).

## Pré-requisitos

RN-004, RN-005, RN-008, RN-020, RN-031, RN-036, RN-042 e RN-045 concluídos.

## Modelo de dados

```sql
-- =========================================================
-- Planos e assinatura (base; a Fase 2 adiciona preços e cobrança)
-- =========================================================
create table plans (
  code                text primary key,          -- free (MVP); essencial, profissional, clinica (Fase 2)
  name                text not null,
  max_active_patients int,                       -- null = ilimitado
  max_members         int,
  features            jsonb not null default '{}',  -- {"patient_area": true, "ai_daily_quota": 5}
  is_public           boolean not null default true
);

insert into plans (code, name, max_active_patients, max_members, features) values
  ('free', 'Gratuito', 20, 1, '{"patient_area": true, "ai_daily_quota": 5}');

create table subscriptions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null unique references organizations(id) on delete cascade,
  plan_code        text not null references plans(code),
  status           text not null default 'active',   -- a Fase 2 transforma em enum com trialing/past_due/canceled
  started_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- create_organization() (RN-004) passa a criar a subscription 'free'.
-- organizations.plan deixa de existir; a fonte de verdade é subscriptions.plan_code.

create table plan_waitlist (                       -- interesse no plano pago
  organization_id uuid primary key references organizations(id) on delete cascade,
  profile_id      uuid not null references profiles(id),
  reason          text,                            -- limite_pacientes | membros | outro
  created_at      timestamptz not null default now()
);

-- Uso atual e limite
create view organization_usage as
select o.id as organization_id,
       p.code as plan_code,
       p.max_active_patients,
       (select count(*) from patients pt
         where pt.organization_id = o.id and pt.status = 'active') as active_patients
from organizations o
join subscriptions s on s.organization_id = o.id
join plans p on p.code = s.plan_code;

-- Limite aplicado no banco
create or replace function enforce_active_patient_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_count int;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;

  select p.max_active_patients into v_limit
  from subscriptions s join plans p on p.code = s.plan_code
  where s.organization_id = new.organization_id;

  if v_limit is null then return new; end if;

  -- trava por organização para evitar corrida entre dois cadastros simultâneos
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text));

  select count(*) into v_count from patients
  where organization_id = new.organization_id and status = 'active' and id <> new.id;

  if v_count >= v_limit then
    raise exception 'PATIENT_LIMIT_REACHED' using errcode = 'P0001',
      detail = format('limit=%s', v_limit);
  end if;
  return new;
end $$;

create trigger patients_limit
before insert or update of status on patients
for each row execute function enforce_active_patient_limit();

-- =========================================================
-- Acesso do paciente
-- =========================================================
alter table patients add column app_invited_at   timestamptz;
alter table patients add column app_activated_at timestamptz;
alter table patients add column share_settings   jsonb not null
  default '{"show_kcal": false, "show_macros": false, "show_weight_history": false}';

create table patient_app_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  email           citext not null,
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now()
);

create or replace function current_patient_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from patients where auth_user_id = auth.uid() and status = 'active'
$$;

-- =========================================================
-- Receitas compartilháveis (estende recipes da Fase 1, RN-042)
-- =========================================================
alter table recipes add column description     text;
alter table recipes add column image_path      text;          -- bucket privado recipe-images
alter table recipes add column prep_time_min   int;
alter table recipes add column difficulty      text;          -- facil | media | dificil
alter table recipes add column tags            text[] not null default '{}';  -- sem_gluten, vegano, lanche...
alter table recipes add column is_patient_visible boolean not null default true;
-- composição por porção é calculada pelo nutrition-core a partir de recipe_items

create table patient_recipes (                 -- receitas enviadas ao paciente
  patient_id      uuid not null references patients(id) on delete cascade,
  recipe_id       uuid not null references recipes(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  note            text,                         -- "ótima para o lanche da tarde"
  shared_by       uuid not null references profiles(id),
  shared_at       timestamptz not null default now(),
  primary key (patient_id, recipe_id)
);
-- Receitas usadas em itens do plano publicado aparecem automaticamente para o paciente (view patient_visible_recipes).

-- =========================================================
-- Recomendações ao paciente
-- =========================================================
create table patient_recommendations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  title           text not null,
  body            text not null,                -- markdown simples
  category        text,                         -- hidratacao, sono, treino, intestino, compras...
  source_snippet_id uuid references text_snippets(id),
  meal_plan_id    uuid references meal_plans(id),  -- opcional: vinculada a um plano
  pinned          boolean not null default false,
  status          text not null default 'draft',   -- draft | published | archived
  published_at    timestamptz,
  read_at         timestamptz,                  -- quando o paciente abriu
  author_id       uuid not null references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on patient_recommendations (patient_id, status, published_at desc);
```

### RLS do paciente

| Tabela / view | Paciente (via `current_patient_ids()`) | Nutricionista da organização |
|---|---|---|
| `patients` | Lê só o próprio registro (nome, dados de contato, `share_settings`) | Leitura e escrita |
| `meal_plans`, `meals`, `meal_items`, `meal_item_substitutions` | Lê só planos `published` do próprio registro | Leitura e escrita |
| `recipes`, `recipe_items` | Lê receitas `is_patient_visible` presentes em `patient_recipes` ou no plano publicado | Leitura e escrita |
| `patient_recipes` | Leitura | Leitura e escrita |
| `patient_recommendations` | Lê só as `published`; atualiza apenas `read_at` (via RPC `mark_recommendation_read`) | Leitura e escrita |
| `anthropometric_assessments` | Lê só se `share_settings.show_weight_history = true`, e só peso e data (view `patient_weight_history`) | Leitura e escrita |
| `clinical_notes`, `anamneses`, `energy_calculations`, `audit_logs`, `subscriptions` | **Sem acesso** | Conforme Fase 0 e 1 |
| `plans` | Sem acesso | Leitura |

Paciente arquivado (`status <> 'active'`) não aparece em `current_patient_ids()` e, portanto, perde o acesso.

## Rotas e telas

| Rota | Tela | Acesso |
|---|---|---|
| `/[orgSlug]/configuracoes/plano` | Plano atual, uso (ex.: "14 de 20 pacientes"), botão "quero o plano pago" | `owner` |
| `/[orgSlug]/pacientes` | Contador de vagas no topo; aviso a partir de 18 | Membro |
| `/[orgSlug]/pacientes/[id]/acesso` | Convidar, reenviar, revogar acesso; o que o paciente vê | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/recomendacoes` | Criar, publicar e arquivar recomendações; ver se foram lidas | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/receitas` | Enviar receitas ao paciente | `owner`, `nutritionist` |
| `/[orgSlug]/receitas` | Biblioteca de receitas da organização (foto, preparo, tags) | `owner`, `nutritionist` |
| `/p/convite/[token]` | Aceitar convite e criar acesso | Público com token |
| `/p/entrar` | Login do paciente por link mágico | Público |
| `/p` | Início: refeição do momento, recomendações novas, atalhos | Paciente |
| `/p/plano` | Plano alimentar publicado, por refeição, com substituições | Paciente |
| `/p/receitas` e `/p/receitas/[id]` | Receitas compartilhadas e as usadas no plano | Paciente |
| `/p/recomendacoes` e `/p/recomendacoes/[id]` | Recomendações publicadas (fixadas no topo) | Paciente |
| `/p/documentos` | PDFs dos planos publicados | Paciente |
| `/p/nutricionistas` | Escolher qual nutricionista ver (quando tiver mais de um) | Paciente |

A área do paciente usa a marca da organização (logo e cor) e é mobile-first. Ela é a base do PWA da Fase 3.

## Itens do backlog

### RN-200 — Planos, assinatura e plano gratuito
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-004
- **Descrição:** Criar a estrutura de planos com o plano `free` e vincular toda organização nova a ele.
- **Tarefas técnicas:**
  - [ ] Migração `plans`, `subscriptions`, `plan_waitlist` e view `organization_usage`
  - [ ] Seed do plano `free` (20 pacientes ativos, 1 membro)
  - [ ] Alterar `create_organization()` para criar a `subscription` `free`
  - [ ] Migrar `organizations.plan` para `subscriptions` e remover a coluna
  - [ ] Helper `getEntitlements(orgId)` em `packages/db` (limites e features), reaproveitado pela Fase 2
  - [ ] RLS: `owner` lê a própria assinatura; ninguém escreve pelo cliente
- **Arquivos/áreas:** `supabase/migrations`, `packages/db/src/entitlements.ts`
- **Critérios de aceite:**
  - Dado um cadastro novo, quando o onboarding termina, então a organização está no plano `free`.
  - `getEntitlements` retorna `maxActivePatients = 20` para uma organização gratuita.
- **Testes:** pgTAP (criação automática, RLS); unidade de `getEntitlements`.

### RN-201 — Limite de 20 pacientes ativos no banco
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-200, RN-020
- **Descrição:** Gatilho `enforce_active_patient_limit` que impede criar ou reativar paciente além do limite do plano.
- **Tarefas técnicas:**
  - [ ] Função e gatilho conforme o modelo, com trava por organização
  - [ ] Tradução do erro `PATIENT_LIMIT_REACHED` para mensagem amigável nas Server Actions
  - [ ] Importações em lote (se houver) respeitam o mesmo limite
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/lib/errors.ts`
- **Critérios de aceite:**
  - Dado 20 pacientes ativos, quando tento cadastrar o 21º, então recebo "Você atingiu o limite de 20 pacientes ativos do plano gratuito".
  - Dado 20 ativos e 1 arquivado, quando tento reativar o arquivado, então recebo o mesmo aviso.
  - Dado 20 ativos, quando arquivo um e cadastro outro, então o cadastro funciona.
  - Dois cadastros simultâneos com 19 ativos resultam em 20 ativos, nunca 21.
- **Testes:** pgTAP (limite, reativação, arquivamento, concorrência com duas sessões).

### RN-202 — Uso do plano e aviso de limite na interface
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-201, RN-013
- **Descrição:** Mostrar ao nutricionista quanto do plano está em uso e o que fazer ao chegar no limite.
- **Tarefas técnicas:**
  - [ ] Contador "X de 20 pacientes ativos" na lista de pacientes e no menu
  - [ ] Aviso a partir de 18 pacientes
  - [ ] No limite: botão "novo paciente" abre modal com opções "arquivar pacientes" e "quero o plano pago" (grava em `plan_waitlist`)
  - [ ] Tela `/[orgSlug]/configuracoes/plano`
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/pacientes`, `apps/web/app/(app)/[orgSlug]/configuracoes/plano`
- **Critérios de aceite:**
  - Dado 18 pacientes ativos, quando abro a lista, então vejo o aviso de que restam 2 vagas.
  - Dado o limite atingido, quando clico em "quero o plano pago", então meu interesse fica registrado e vejo a confirmação.
- **Testes:** e2e (limite atingido, arquivar e liberar vaga).

### RN-203 — Convite do paciente e vínculo da conta
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-005, RN-020
- **Descrição:** O nutricionista convida o paciente por e-mail (ou link copiável para WhatsApp); o paciente cria acesso por link mágico e a conta é vinculada ao registro `patients`.
- **Tarefas técnicas:**
  - [ ] Migração `patient_app_invites` e colunas de acesso em `patients`
  - [ ] Botões "Convidar para a área do paciente", "Reenviar" e "Revogar acesso"
  - [ ] Token aleatório com hash guardado, validade de 7 dias, uso único
  - [ ] Edge Function `link-patient-account`: valida token, confere o e-mail, preenche `patients.auth_user_id` e `app_activated_at`
  - [ ] Se o e-mail já tem conta de paciente (outro nutricionista), apenas vincula o novo registro
  - [ ] Bloquear vínculo de e-mail que pertence a um membro de organização (profissional)
  - [ ] Revogar acesso: limpa `auth_user_id` do registro daquela organização
  - [ ] E-mail de convite com a marca do nutricionista
- **Arquivos/áreas:** `supabase/migrations`, `supabase/functions/link-patient-account`, `apps/web/app/p/convite/[token]`, `apps/web/app/(app)/[orgSlug]/pacientes/[id]/acesso`
- **Critérios de aceite:**
  - Dado um convite válido, quando o paciente aceita com o mesmo e-mail, então entra na área do paciente e vê os dados daquele nutricionista.
  - Dado um convite com outro e-mail, quando tenta aceitar, então o vínculo é negado.
  - Dado o acesso revogado, quando o paciente tenta entrar, então não vê mais os dados daquela organização.
- **Testes:** testes da Edge Function (válido, expirado, reutilizado, e-mail divergente, e-mail de profissional); e2e convite → login.

### RN-204 — Área do paciente: autenticação, layout e início
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-203, RN-019
- **Descrição:** Estrutura da área do paciente em `/p`, mobile-first, com a marca do nutricionista.
- **Tarefas técnicas:**
  - [ ] Grupo de rotas `app/(patient)/p` com layout próprio e navegação inferior (Início, Plano, Receitas, Recomendações)
  - [ ] Login por link mágico (`signInWithOtp`) em `/p/entrar`
  - [ ] Middleware: usuário paciente só acessa `/p/*`; profissional não acessa `/p`
  - [ ] Tema dinâmico com logo e cor da organização
  - [ ] Início: refeição do momento (pelo horário local), recomendações não lidas, receita em destaque
  - [ ] Estados vazios ("Seu nutricionista ainda não publicou seu plano")
- **Arquivos/áreas:** `apps/web/app/(patient)/p`, `apps/web/middleware.ts`, `packages/ui`
- **Critérios de aceite:**
  - Dado um paciente logado, quando tenta abrir `/[orgSlug]`, então é redirecionado para `/p`.
  - Em 360 px de largura a área funciona sem rolagem horizontal, com alvos de toque de pelo menos 44 px.
- **Testes:** e2e em viewport de celular; teste do middleware.

### RN-205 — Plano alimentar na área do paciente
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-204, RN-031, RN-034
- **Descrição:** O paciente vê o plano publicado vigente, por refeição, com medidas caseiras, substituições e orientações.
- **Tarefas técnicas:**
  - [ ] Query do plano `published` mais recente do paciente
  - [ ] Refeições em ordem de horário, com destaque para a próxima
  - [ ] Substituições por item (folha inferior)
  - [ ] Orientações gerais e por refeição do plano
  - [ ] Respeitar `share_settings` (ocultar calorias e macros por padrão)
  - [ ] Ao publicar novo plano, a área mostra o novo e o anterior sai da tela inicial
- **Arquivos/áreas:** `apps/web/app/(patient)/p/plano`
- **Critérios de aceite:**
  - Dado um plano em rascunho, quando o paciente abre a área, então não vê esse plano.
  - Dado `show_kcal = false`, quando o paciente abre uma refeição, então nenhuma caloria aparece.
- **Testes:** pgTAP (paciente não lê rascunho nem plano de outro paciente ou organização); e2e.

### RN-206 — Biblioteca de receitas compartilháveis
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-042
- **Descrição:** Evoluir as preparações da Fase 1 para receitas completas que o nutricionista mantém numa biblioteca e usa no plano.
- **Tarefas técnicas:**
  - [ ] Migração com os novos campos de `recipes`
  - [ ] Tela `/[orgSlug]/receitas`: lista com busca e filtros por tag, editor com foto, descrição, ingredientes (da base de alimentos), modo de preparo, tempo, porções e dificuldade
  - [ ] Upload de foto para bucket privado `recipe-images` com redimensionamento e URLs assinadas
  - [ ] Informação nutricional por porção calculada pelo `nutrition-core`
  - [ ] Seed de 20 receitas base escritas pela nutricionista parceira, disponíveis para todas as organizações (`organization_id = null`) e duplicáveis
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/receitas`, `packages/nutrition-core/src/recipe`
- **Critérios de aceite:**
  - Dado uma receita com 5 ingredientes e 4 porções, quando salvo, então vejo kcal e macros por porção.
  - Uma organização não vê as receitas privadas de outra, mas vê as receitas base.
- **Testes:** pgTAP (isolamento, receitas base somente leitura); unidade do cálculo por porção; e2e do editor.

### RN-207 — Receitas na área do paciente
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-206, RN-204
- **Descrição:** O paciente vê as receitas enviadas pelo nutricionista e as que fazem parte do plano.
- **Tarefas técnicas:**
  - [ ] Migração `patient_recipes` e view `patient_visible_recipes` (enviadas + usadas no plano publicado)
  - [ ] Na ficha do paciente: "enviar receita" com observação opcional
  - [ ] Na área do paciente: lista com foto e filtro por tag; detalhe com ingredientes em medidas caseiras, modo de preparo e porções
  - [ ] Informação nutricional exibida só se `show_kcal` estiver ativo
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(patient)/p/receitas`, `apps/web/app/(app)/[orgSlug]/pacientes/[id]/receitas`
- **Critérios de aceite:**
  - Dado uma receita usada no almoço do plano publicado, quando o paciente abre "Receitas", então ela aparece sem envio manual.
  - Dado uma receita não enviada e fora do plano, quando o paciente tenta abrir pelo id, então recebe "não encontrada".
- **Testes:** pgTAP; e2e.

### RN-208 — Recomendações ao paciente
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-045, RN-204
- **Descrição:** O nutricionista publica recomendações individuais (hidratação, sono, compras, treino, intestino etc.), e o paciente as lê na sua área.
- **Tarefas técnicas:**
  - [ ] Migração `patient_recommendations`
  - [ ] Na ficha: criar recomendação do zero ou a partir dos textos reutilizáveis (RN-045), com categoria, fixar no topo, rascunho e publicação
  - [ ] Publicar várias de uma vez (ex.: pacote "primeira consulta")
  - [ ] Área do paciente: lista por categoria, fixadas primeiro, selo de "nova"
  - [ ] RPC `mark_recommendation_read` e indicação de lida para o nutricionista
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(patient)/p/recomendacoes`, `apps/web/app/(app)/[orgSlug]/pacientes/[id]/recomendacoes`
- **Critérios de aceite:**
  - Dado uma recomendação publicada, quando o paciente abre, então ela fica marcada como lida e o nutricionista vê a data da leitura.
  - Dado uma recomendação em rascunho, quando o paciente acessa a área, então não a vê.
  - O paciente não consegue alterar nenhum campo além de `read_at`.
- **Testes:** pgTAP (visibilidade e escrita restrita); e2e.

### RN-209 — Documentos do paciente
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-036, RN-204
- **Descrição:** O paciente baixa os PDFs dos planos publicados.
- **Tarefas técnicas:**
  - [ ] Lista de planos publicados (vigente e anteriores) com download por URL assinada de curta validade
  - [ ] Política de storage: paciente só baixa arquivos dos próprios planos
- **Arquivos/áreas:** `apps/web/app/(patient)/p/documentos`, `supabase/migrations` (políticas de storage)
- **Critérios de aceite:**
  - Dado o link de um PDF de outro paciente, quando o paciente tenta baixar, então o acesso é negado.
- **Testes:** teste da política de storage; e2e.

### RN-210 — O que o paciente vê (configurações de compartilhamento)
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-205
- **Descrição:** O nutricionista decide, por paciente, o que aparece na área: calorias, macros e histórico de peso.
- **Tarefas técnicas:**
  - [ ] Campo `share_settings` e padrão por organização
  - [ ] Tela de acesso do paciente com os interruptores e uma pré-visualização "ver como paciente"
  - [ ] View `patient_weight_history` (só data e peso), liberada se `show_weight_history`
  - [ ] Gráfico simples de peso na área do paciente quando liberado
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/pacientes/[id]/acesso`, `apps/web/app/(patient)/p`
- **Critérios de aceite:**
  - Dado `show_weight_history = false`, quando o paciente consulta a view diretamente pela API, então não recebe nenhuma linha.
- **Testes:** pgTAP; e2e da pré-visualização.

### RN-211 — Paciente com mais de um nutricionista
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-203, RN-204
- **Descrição:** Uma mesma pessoa pode ser paciente de nutricionistas diferentes sem misturar os dados.
- **Tarefas técnicas:**
  - [ ] Seletor de nutricionista em `/p/nutricionistas` (lembrado no cookie) quando houver mais de um vínculo
  - [ ] Todas as consultas da área do paciente filtradas pelo registro `patients` selecionado
  - [ ] Marca (logo e cor) muda conforme o nutricionista selecionado
- **Arquivos/áreas:** `apps/web/app/(patient)/p`, `apps/web/lib/patient-context.ts`
- **Critérios de aceite:**
  - Dado um paciente vinculado a duas organizações, quando seleciona a primeira, então não vê nenhum plano, receita ou recomendação da segunda.
- **Testes:** pgTAP e e2e com dois vínculos.

### RN-212 — Avisos por e-mail ao paciente
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-205, RN-208
- **Descrição:** Avisar o paciente quando houver plano novo, recomendação nova ou receita enviada. A versão por WhatsApp vem na Fase 2.
- **Tarefas técnicas:**
  - [ ] Templates de e-mail com a marca do nutricionista e link direto para a área
  - [ ] Agrupar avisos do mesmo dia num único e-mail
  - [ ] Paciente pode desligar os avisos na própria área
- **Arquivos/áreas:** `apps/web/lib/email`, `supabase/functions/patient-notifications`
- **Critérios de aceite:**
  - Dado um plano e duas recomendações publicados no mesmo dia, quando o envio roda, então o paciente recebe um único e-mail.
- **Testes:** unidade dos templates e do agrupamento.

### RN-213 — Testes de isolamento e e2e da área do paciente
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-201 a RN-212
- **Descrição:** Garantir que nenhum paciente veja dados de outro e que o limite do plano não pode ser contornado.
- **Tarefas técnicas:**
  - [ ] Suíte pgTAP com papéis: paciente A, paciente B (mesma organização), paciente C (outra organização), paciente arquivado, nutricionista, assistente
  - [ ] Teste de tentativa de leitura de rascunhos, notas clínicas, anamneses e assinaturas pelo paciente
  - [ ] Teste de IDOR trocando ids em todas as rotas `/p/*`
  - [ ] e2e: nutricionista cadastra, monta e publica o plano, envia receita e recomendação, convida → paciente entra e vê tudo
- **Arquivos/áreas:** `supabase/tests`, `apps/web/e2e`
- **Critérios de aceite:**
  - A suíte passa no CI e cobre todas as tabelas legíveis pelo paciente.
- **Testes:** pgTAP; e2e.

### RN-214 — Métricas do plano gratuito
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-202, RN-204
- **Descrição:** Medir uso do plano gratuito para decidir preço e limites dos planos pagos.
- **Tarefas técnicas:**
  - [ ] Eventos de produto: paciente cadastrado, limite atingido, interesse no plano pago, convite enviado, paciente ativou o acesso, recomendação lida
  - [ ] Painel interno (consulta SQL ou dashboard simples) com: organizações gratuitas, distribuição de pacientes ativos (quantas perto de 20), taxa de ativação dos pacientes, lista de interesse
- **Arquivos/áreas:** `apps/web/lib/analytics`, `supabase/migrations` (views internas)
- **Critérios de aceite:**
  - É possível responder "quantos nutricionistas atingiram o limite de 20 no último mês".
- **Testes:** —

## Sequência semanal (2 desenvolvedores)

| Semana | Dev A | Dev B |
|---|---|---|
| 1 | RN-200, RN-201, RN-202 | RN-203, RN-204 (início) |
| 2 | RN-206, RN-207 | RN-204, RN-205, RN-209 |
| 3 | RN-208, RN-212 | RN-210, RN-211, RN-213, RN-214 |

## Critério de pronto da fase

- Um nutricionista novo entra no plano gratuito e não consegue passar de 20 pacientes ativos, nem pela tela nem pela API.
- O paciente recebe o convite, entra pelo link mágico e vê no celular o plano publicado, as receitas e as recomendações, com a marca do nutricionista.
- A suíte de isolamento prova que o paciente não vê dados de outro paciente, de outra organização nem dados clínicos internos.
- Pronto para o beta: o marco M1 passa a ser o fim desta fase.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Nutricionista contornar o limite arquivando e reativando | Arquivado perde o acesso à área do paciente; métrica de reativações para avaliar abuso |
| Limite de 20 baixo ou alto demais | Valor configurável em `plans`; decidir com as métricas do RN-214 |
| Vazamento entre pacientes | RLS baseada em `current_patient_ids()`, suíte RN-213 e teste de IDOR |
| Paciente sem e-mail | Link de convite copiável para enviar por WhatsApp; login por link mágico exige e-mail no MVP (login por telefone fica para depois) |
| Fotos de receitas pesando no disco da VPS | Redimensionar no upload (máx. 1600 px, WebP) e acompanhar o uso do Storage |

## Métricas a acompanhar

- Nutricionistas no plano gratuito e quantos chegam a 18 ou mais pacientes ativos.
- Inscritos na lista de interesse do plano pago.
- Taxa de ativação: pacientes convidados que entraram na área.
- Pacientes que voltam à área ao menos uma vez por semana.
- Recomendações publicadas e lidas.
