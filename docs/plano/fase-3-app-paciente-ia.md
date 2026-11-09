# Fase 3 — App do paciente + IA

## Objetivo

1. Colocar o plano alimentar no bolso do paciente com um **PWA** (ver [ADR 0003](../adr/0003-app-paciente-pwa.md)) que ele usa no dia a dia — plano do dia, substituições, lista de compras, diário, hidratação e lembretes — com a marca do nutricionista. Isso aumenta adesão ao tratamento e o custo de troca do sistema (retenção).
2. Reduzir o tempo de montagem do plano alimentar com **IA que sugere e o nutricionista decide**: sugestão de plano usando somente alimentos da base, com o cálculo final feito pelo `nutrition-core`, e resumo da anamnese e do histórico.

Duração estimada: **6 semanas** (1 a 2 devs full-stack).

## Escopo / Fora de escopo

**Escopo**
- PWA instalável (manifest, service worker, cache offline do plano), acesso por magic link.
- Plano do dia, substituições, lista de compras, diário alimentar (marcar refeições), hidratação, push web.
- Marca do nutricionista (logo, cor, nome) no app.
- Painel de adesão do paciente para o nutricionista.
- Convite do paciente para o app e publicação do plano.
- IA: sugestão de plano alimentar, resumo de anamnese/histórico, pseudonimização, saída estruturada validada por Zod, registro em `ai_suggestions`, cotas por plano, avaliação de qualidade com casos de teste, monitoramento de custo.

**Fora de escopo**
- Chat paciente ↔ nutricionista (P2; avaliar após medir uso do app).
- Fotos de refeições e reconhecimento de alimentos por imagem.
- App nativo (Expo) — só se as métricas do PWA pedirem.
- Assistente RAG sobre diretrizes clínicas (Fase 6).
- IA conversando diretamente com o paciente (nunca sem revisão do profissional).

## Pré-requisitos

| Item | Por quê |
|---|---|
| RN-005, RN-008 | Auth e RLS (paciente é um novo papel com acesso restrito) |
| RN-011 | Base TACO — a IA só pode usar alimentos da base |
| RN-021 | Consentimento — incluir termo de uso de IA e do app |
| RN-024, RN-026 | Anamnese — insumo do resumo por IA |
| RN-027, RN-029 | `nutrition-core` — cálculo de GET e antropometria |
| RN-031 a RN-035 | Plano alimentar, substituições e modelos — o app exibe e a IA preenche |
| RN-057 | Planos e `getEntitlements` — cotas de IA e liberação do app por plano |
| RN-059 | Preferências de comunicação — push e lembretes do app |

## Modelo de dados

```sql
-- =========================================================
-- Acesso do paciente ao app
-- =========================================================
alter table patients add column app_invited_at   timestamptz;
alter table patients add column app_activated_at timestamptz;
-- patients.auth_user_id (já existe) é preenchido no primeiro login por magic link

create table patient_app_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  email           text not null,
  token_hash      text not null unique,     -- hash do token; o token só existe no link
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now()
);

-- Função auxiliar para RLS do paciente
create function current_patient_ids() returns setof uuid
language sql stable security definer as $$
  select id from patients where auth_user_id = auth.uid()
$$;

-- =========================================================
-- Diário alimentar e hidratação
-- =========================================================
create type meal_log_status as enum ('done', 'partial', 'skipped', 'replaced');

create table food_diary_entries (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  patient_id        uuid not null references patients(id) on delete cascade,
  meal_plan_id      uuid not null references meal_plans(id) on delete cascade,
  meal_id           uuid not null references meals(id) on delete cascade,
  log_date          date not null,          -- data local do paciente
  status            meal_log_status not null,
  substitution_ids  uuid[] not null default '{}', -- meal_item_substitutions usadas
  note              text check (char_length(note) <= 500),
  client_id         uuid not null,          -- gerado no dispositivo (sync offline idempotente)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (patient_id, meal_id, log_date),
  unique (client_id)
);
create index on food_diary_entries (patient_id, log_date desc);

create table hydration_goals (
  patient_id      uuid primary key references patients(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  daily_ml        int  not null check (daily_ml between 500 and 6000),
  cup_ml          int  not null default 250,
  set_by          uuid references profiles(id),  -- null = calculado (35 ml/kg)
  updated_at      timestamptz not null default now()
);

create table hydration_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  log_date        date not null,
  amount_ml       int  not null check (amount_ml between 1 and 2000),
  logged_at       timestamptz not null default now(),
  client_id       uuid not null unique
);
create index on hydration_logs (patient_id, log_date);

-- =========================================================
-- Lista de compras
-- =========================================================
create table shopping_list_checks (
  patient_id    uuid not null references patients(id) on delete cascade,
  meal_plan_id  uuid not null references meal_plans(id) on delete cascade,
  food_id       uuid not null references foods(id),
  week_start    date not null,
  checked       boolean not null default true,
  primary key (patient_id, meal_plan_id, food_id, week_start)
);
-- A lista em si é calculada (função `shopping_list(meal_plan_id, days)` no nutrition-core),
-- somando quantidades por alimento e agrupando por grupo alimentar.

-- =========================================================
-- Push web
-- =========================================================
create table push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create table patient_reminder_settings (
  patient_id         uuid primary key references patients(id) on delete cascade,
  meal_reminders     boolean not null default true,
  hydration_reminders boolean not null default true,
  hydration_interval_min int not null default 120,
  quiet_start        time not null default '22:00',
  quiet_end          time not null default '07:00',
  timezone           text not null default 'America/Sao_Paulo'
);

-- =========================================================
-- Marca do nutricionista
-- =========================================================
alter table organizations add column app_display_name text;
alter table organizations add column app_welcome_message text check (char_length(app_welcome_message) <= 300);
-- logo_path e brand_color já existem (Fase 0)

-- =========================================================
-- IA
-- =========================================================
create type ai_task as enum ('meal_plan_suggestion', 'anamnesis_summary', 'history_summary');
create type ai_outcome as enum ('pending', 'accepted', 'accepted_with_edits', 'discarded', 'failed', 'invalid_output');

create table ai_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  patient_id         uuid references patients(id) on delete set null,
  requested_by       uuid not null references profiles(id),
  task               ai_task not null,
  prompt_version     text not null,          -- ex.: meal_plan_v3
  model              text not null,
  input_pseudonymized jsonb not null,        -- exatamente o que foi enviado (sem PII)
  output_raw         jsonb,                  -- resposta estruturada do modelo
  output_validated   jsonb,                  -- após Zod + recálculo pelo nutrition-core
  validation_errors  jsonb,
  outcome            ai_outcome not null default 'pending',
  edit_distance      numeric,                -- quanto o profissional mudou (0..1)
  feedback_rating    smallint check (feedback_rating between 1 and 5),
  feedback_comment   text,
  meal_plan_id       uuid references meal_plans(id) on delete set null, -- plano gerado a partir da sugestão
  input_tokens       int,
  output_tokens      int,
  cost_usd_micros    bigint,
  latency_ms         int,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz
);
create index on ai_suggestions (organization_id, created_at desc);
create index on ai_suggestions (task, prompt_version, outcome);

create table ai_usage_monthly (
  organization_id uuid not null references organizations(id) on delete cascade,
  month           date not null,
  task            ai_task not null,
  requests        int not null default 0,
  cost_usd_micros bigint not null default 0,
  primary key (organization_id, month, task)
);
-- Cotas ficam em plans.features: {"ai": {"meal_plan_suggestion": 60, "anamnesis_summary": 200}}

create table ai_eval_runs (
  id              uuid primary key default gen_random_uuid(),
  prompt_version  text not null,
  model           text not null,
  dataset_version text not null,
  cases_total     int not null,
  cases_passed    int not null,
  metrics         jsonb not null,   -- erro médio de kcal, % alimentos fora da base, violações de restrição...
  cost_usd_micros bigint,
  git_sha         text,
  created_at      timestamptz not null default now()
);
```

### Políticas RLS principais

```sql
-- Paciente lê somente os próprios planos publicados
create policy meal_plans_patient_read on meal_plans for select
  using (patient_id in (select current_patient_ids()) and status = 'published');

create policy meals_patient_read on meals for select
  using (meal_plan_id in (select id from meal_plans
                          where patient_id in (select current_patient_ids()) and status = 'published'));
-- idem meal_items e meal_item_substitutions

-- Diário e hidratação: paciente lê e escreve os próprios; membros da organização leem
alter table food_diary_entries enable row level security;
create policy diary_patient_rw on food_diary_entries for all
  using (patient_id in (select current_patient_ids()))
  with check (patient_id in (select current_patient_ids()));
create policy diary_staff_read on food_diary_entries for select
  using (has_role(organization_id, array['owner','nutritionist']));   -- assistant não vê dado clínico
-- idem hydration_logs, shopping_list_checks, patient_reminder_settings

-- Paciente NÃO acessa: anamneses de outros, clinical_notes, energy_calculations,
-- anthropometric_assessments não compartilhadas, ai_suggestions, financial_*.

-- ai_suggestions: somente owner/nutritionist da organização; escrita apenas pelo servidor
alter table ai_suggestions enable row level security;
create policy ai_read on ai_suggestions for select
  using (has_role(organization_id, array['owner','nutritionist']));
create policy ai_decide on ai_suggestions for update
  using (has_role(organization_id, array['owner','nutritionist']) and requested_by = auth.uid());

-- push_subscriptions: cada usuário gerencia as próprias
create policy push_own on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ai_eval_runs: sem acesso para authenticated (uso interno via service_role)
alter table ai_eval_runs enable row level security;
```

## Rotas e telas

### App do paciente (PWA — grupo de rotas `(patient)` em `apps/web`)

| Rota Next.js | Tela | Papel que acessa |
|---|---|---|
| `/p/login` | Entrar com e-mail (magic link) | público |
| `/p/invite/[token]` | Aceitar convite, aceitar termos, criar acesso | público (token) |
| `/p` | Hoje: refeições do dia com horário, progresso de hidratação, mensagem do nutricionista | patient |
| `/p/meals/[mealId]` | Detalhe da refeição: itens, medidas caseiras, substituições, marcar como feita | patient |
| `/p/plan` | Plano completo por refeição | patient |
| `/p/shopping-list` | Lista de compras da semana com checkboxes | patient |
| `/p/diary` | Histórico do diário (calendário com adesão por dia) | patient |
| `/p/hydration` | Registro rápido de água e histórico | patient |
| `/p/progress` | Evolução de peso/medidas compartilhadas pelo nutricionista | patient |
| `/p/settings` | Notificações, horário de silêncio, sair, excluir acesso | patient |
| `/p/offline` | Fallback offline | patient |

### Painel do nutricionista

| Rota Next.js | Tela | Papel que acessa |
|---|---|---|
| `/app/patients/[id]/app` | Status do convite, enviar/reenviar convite, meta de hidratação | owner, nutritionist |
| `/app/patients/[id]/adherence` | Adesão: % refeições feitas por dia/refeição, substituições mais usadas, hidratação | owner, nutritionist |
| `/app/adherence` | Pacientes com queda de adesão (lista priorizada) | owner, nutritionist |
| `/app/patients/[id]/meal-plans/new?ai=1` | Assistente de sugestão de plano por IA (parâmetros → sugestão → revisar no editor) | owner, nutritionist |
| `/app/patients/[id]/anamneses/[aid]` | Botão "Resumir com IA" e painel de resumo | owner, nutritionist |
| `/app/patients/[id]` | Card "Resumo do histórico" gerado por IA | owner, nutritionist |
| `/app/settings/app-branding` | Nome no app, logo, cor, mensagem de boas-vindas, pré-visualização | owner |
| `/app/settings/ai` | Uso de IA no mês, cota do plano, histórico de sugestões | owner |

### Servidor

| Rota | Função |
|---|---|
| `POST /api/ai/meal-plan-suggestion` | Gera sugestão (Server Action ou Route Handler; nunca no cliente) |
| `POST /api/ai/anamnesis-summary` | Gera resumo |
| `POST /api/push/subscribe` | Registra assinatura de push |
| `/manifest.webmanifest` | Manifest dinâmico por organização (nome, cor, ícone) |

## Integrações/fluxos

### F-01 — Convite e primeiro acesso do paciente

1. Nutricionista clica em "Convidar para o app" (exige e-mail do paciente e plano com `features.patient_app`).
2. Servidor cria `patient_app_invites` (token aleatório de 32 bytes, guarda só o hash, expira em 7 dias) e envia e-mail (e WhatsApp, se opt-in) pelo workflow de mensagens da Fase 2 (`kind = 'app_invite'`, `idempotency_key = app_invite:<invite_id>`).
3. Paciente abre `/p/invite/[token]` → aceita termos (registra em `consent_records` com `terms_version` do app) → recebe magic link do Supabase Auth.
4. No callback, Edge Function `link-patient-account` associa `auth.uid()` a `patients.auth_user_id` (somente se o e-mail confirmado for igual ao do convite) e marca `accepted_at`/`app_activated_at`.
- **Erro:** token expirado ou já usado → tela pede novo convite ao nutricionista. E-mail divergente → nega e registra em `audit_logs`.
- **Idempotência:** convite aceito uma vez; reenviar convite invalida os anteriores (`expires_at = now()`).

### F-02 — Sincronização offline do diário e hidratação

- Service worker (Serwist) faz cache do shell do app e do plano publicado (stale-while-revalidate).
- Registros feitos offline vão para IndexedDB com `client_id` (UUID v7) e são enviados quando a conexão volta (Background Sync quando disponível; senão, ao abrir o app).
- Servidor faz `upsert` por `client_id` → reenvio não duplica. Conflito no diário (`unique (patient_id, meal_id, log_date)`): vale o último `updated_at`.

### F-03 — Lembretes push (n8n)

- **Gatilho:** cron no n8n a cada 15 min → Edge Function `push-dispatcher`.
- **Passos:** seleciona pacientes com refeição cujo horário caiu na janela, sem registro no diário, fora do silêncio, com `meal_reminders = true`; idem hidratação por `hydration_interval_min` se abaixo da meta proporcional ao horário. Envia via Web Push (VAPID, biblioteca `web-push`). Registra em `message_logs` (`channel = 'push'`, novo valor no enum).
- **Erro:** endpoint 404/410 → apaga `push_subscriptions`; outros erros → retry 1x.
- **Idempotência:** `meal_reminder:<patient_id>:<meal_id>:<date>`; `hydration_reminder:<patient_id>:<date>:<slot>`.
- **Observação iOS:** push web só funciona com o PWA instalado na tela inicial (iOS 16.4+); o app mostra instrução de instalação para iPhone.

### F-04 — Sugestão de plano alimentar por IA

```
Nutricionista (parâmetros) ─▶ Server Action ─▶ checa cota ─▶ monta contexto pseudonimizado
   ─▶ seleciona alimentos candidatos da base (SQL) ─▶ LLM (tool/JSON schema)
   ─▶ Zod valida ─▶ resolve food_ids ─▶ nutrition-core recalcula ─▶ ajuste de porções
   ─▶ grava ai_suggestions ─▶ abre no editor como rascunho (status draft)
```

1. **Entrada:** `energy_calculations` escolhido (kcal e macros alvo), nº de refeições e horários, restrições (alergias, intolerâncias, vegetariano...), preferências e aversões (da anamnese), orçamento/praticidade, observações livres.
2. **Pseudonimização (RN-081):** remove nome, CPF, contato, datas exatas (vira idade e sexo), texto livre passa por filtro de PII (regex + lista de nomes do paciente). Nada sai do servidor sem passar por `pseudonymize()`.
3. **Candidatos:** consulta SQL retorna até ~300 alimentos da base (TACO/TBCA/próprios da organização) filtrados por restrição e por grupos comuns na refeição, cada um com `food_id` curto (ex.: `F123`) e nutrientes por 100 g. O modelo **só pode escolher dessa lista**.
4. **Chamada ao LLM:** saída estruturada (JSON schema / tool use) com `meals[].items[] {food_ref, grams, household_measure_hint}` e `substitutions[]`. Temperatura baixa. `prompt_version` versionado em `packages/ai/prompts/`.
5. **Validação (RN-083):** Zod valida o formato; rejeita `food_ref` fora da lista; limita gramas (1–1000 g por item).
6. **Recálculo (RN-075):** `nutrition-core` calcula kcal, macros e micros reais; função `fitPortions()` ajusta porções (otimização simples por mínimos quadrados com limites) para ficar dentro de ±5% da meta de kcal e ±10% dos macros. Se não convergir, devolve com alerta visível.
7. **Checagem de segurança:** nenhum alimento com alérgeno declarado; alerta se sódio/fibra fora de faixa de referência.
8. **Persistência:** `ai_suggestions` com entrada pseudonimizada, saída, custo e latência; cria `meal_plans` em `draft` vinculado.
9. **Decisão:** o nutricionista edita no editor normal (RN-031); ao publicar, `outcome` = `accepted` ou `accepted_with_edits` com `edit_distance`; descartar = `discarded`.
- **Erro:** timeout (30 s) ou saída inválida após 1 nova tentativa → `outcome = invalid_output`, mensagem amigável, **não consome cota**.
- **Idempotência:** botão desabilitado durante a geração; `request_id` do cliente evita gerar duas vezes no duplo clique.

### F-05 — Resumo de anamnese e histórico

- Entrada: respostas da anamnese (pseudonimizadas), últimas N avaliações antropométricas (valores, sem datas absolutas), metas.
- Saída estruturada: `{ queixa_principal, historico_clinico, habitos, sinais_alerta[], pontos_para_investigar[] }` validada por Zod; cada item com referência à pergunta de origem (`source_question_ids`) para o profissional conferir.
- Exibido como "Resumo gerado por IA — revise" e nunca incorporado ao prontuário sem ação explícita ("Copiar para evolução").

### F-06 — Avaliação de qualidade (offline, no CI)

- Dataset versionado `packages/ai/evals/meal-plan/v1/*.json` com 30–50 casos sintéticos (perfis: emagrecimento, hipertrofia, vegetariano, diabético, celíaco, alergia a amendoim, gestante, idoso...).
- Métricas por caso: % alimentos fora da base (meta 0), violação de restrição (meta 0), erro de kcal após `fitPortions` (meta ≤ 5%), erro de proteína (≤ 10%), nº de refeições correto, diversidade (nº de alimentos distintos), tempo e custo.
- Rubrica qualitativa revisada pela nutricionista em amostra de 10 casos por versão de prompt (nota 1–5: adequação cultural, praticidade, variedade).
- Job `pnpm ai:eval` roda em mudança de prompt/modelo (workflow manual no GitHub Actions) e grava `ai_eval_runs`. Mudança de prompt só vai para produção se não piorar as métricas críticas.

### F-07 — Cotas e custos

- Antes de cada chamada: `check_ai_quota(org, task)` compara `ai_usage_monthly` com `plans.features.ai`. Esgotou → mensagem com upgrade.
- Depois: incrementa `requests` e `cost_usd_micros` (tokens × preço do modelo configurado em `packages/ai/pricing.ts`).
- Alerta interno se o custo de IA de uma organização passar de 20% do valor do plano no mês.
- Rate limit: 10 requisições/min por usuário.

## Itens do backlog

### RN-070 — PWA: instalação, magic link, layout mobile
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-005, RN-002
- **Descrição:** Estrutura do app do paciente dentro do `apps/web` (grupo de rotas `(patient)`), login por magic link, layout mobile-first e navegação inferior.
- **Tarefas técnicas:**
  - [ ] Grupo de rotas `app/(patient)/p/` com layout próprio (tab bar: Hoje, Plano, Compras, Progresso)
  - [ ] Login por magic link (Supabase Auth `signInWithOtp`) com redirect para `/p`
  - [ ] Middleware: usuário com papel paciente só acessa `/p/*`; profissional só `/app/*`
  - [ ] Tela de instrução de instalação (Android/Chrome e iPhone/Safari)
  - [ ] Acessibilidade: alvos de toque ≥ 44 px, contraste AA, fonte escalável
- **Arquivos/áreas:** `apps/web/app/(patient)/`, `apps/web/middleware.ts`, `packages/ui/mobile/`
- **Critérios de aceite:**
  - Dado um paciente com convite aceito, quando entra pelo magic link, então cai em `/p` e não consegue abrir `/app`.
  - Dado um nutricionista logado, quando abre `/p`, então é redirecionado para `/app`.
- **Testes:** e2e (Playwright, viewport mobile) do login; teste de middleware; Lighthouse PWA/acessibilidade no CI.

### RN-071 — Plano do dia e substituições no app
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-070, RN-086
- **Descrição:** Tela "Hoje" com as refeições do plano publicado em ordem de horário, medidas caseiras e substituições por item.
- **Tarefas técnicas:**
  - [ ] Query do plano publicado ativo (o mais recente `published`)
  - [ ] Cards de refeição com destaque da próxima refeição pelo horário local
  - [ ] Detalhe da refeição com substituições (bottom sheet)
  - [ ] Exibir somente informação útil ao paciente (sem kcal por padrão; configurável pelo nutricionista)
  - [ ] Estado vazio: "Seu nutricionista ainda não publicou seu plano"
- **Arquivos/áreas:** `apps/web/app/(patient)/p/page.tsx`, `apps/web/app/(patient)/p/meals/[mealId]/`
- **Critérios de aceite:**
  - Dado um plano publicado com 5 refeições, quando o paciente abre "Hoje" às 11:30, então a refeição do almoço aparece em destaque.
  - Dado um plano em rascunho, quando o paciente abre o app, então ele não vê esse plano.
  - Dado a opção "ocultar calorias" ativa, quando o paciente vê a refeição, então nenhuma kcal aparece.
- **Testes:** RLS (paciente não lê rascunho nem plano de outro paciente); e2e da navegação; unidade da lógica de "próxima refeição".

### RN-072 — Lista de compras
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-071
- **Descrição:** Lista semanal gerada do plano, agrupada por seção do mercado, com quantidades arredondadas e itens marcáveis.
- **Tarefas técnicas:**
  - [ ] `shoppingList(plan, days)` em `nutrition-core`: soma por `food_id`, converte para unidade de compra (g → kg, unidades, maços) e arredonda
  - [ ] Mapeamento grupo alimentar → seção (Hortifrúti, Açougue, Laticínios, Mercearia...)
  - [ ] Escolha de 7 ou 14 dias e opção de incluir substituições escolhidas
  - [ ] Checkboxes persistidos em `shopping_list_checks`; compartilhar como texto
- **Arquivos/áreas:** `packages/nutrition-core/src/shopping-list.ts`, `apps/web/app/(patient)/p/shopping-list/`
- **Critérios de aceite:**
  - Dado 150 g de arroz no almoço todos os dias, quando gero a lista de 7 dias, então aparece "Arroz — 1,05 kg" em Mercearia.
  - Dado item marcado, quando reabro o app na mesma semana, então continua marcado.
- **Testes:** unidade de `shoppingList` (somas, arredondamentos, unidades); e2e.

### RN-073 — Diário alimentar e hidratação
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-071, RN-078
- **Descrição:** Marcar refeição como feita/parcial/pulada/substituída e registrar copos de água, inclusive offline.
- **Tarefas técnicas:**
  - [ ] Migrações `food_diary_entries`, `hydration_goals`, `hydration_logs` + RLS
  - [ ] Ações rápidas no card da refeição (1 toque) e nota opcional
  - [ ] Meta de hidratação: padrão 35 ml/kg do último peso; nutricionista pode sobrescrever
  - [ ] Botões +1 copo / valor personalizado / desfazer
  - [ ] Fila offline com IndexedDB e `client_id`; upsert idempotente
  - [ ] Calendário de adesão em `/p/diary`
- **Arquivos/áreas:** `supabase/migrations/*_patient_app.sql`, `apps/web/app/(patient)/p/`, `apps/web/lib/offline-queue.ts`
- **Critérios de aceite:**
  - Dado o app offline, quando marco o almoço como feito e reconecto, então o registro aparece no painel do nutricionista uma única vez.
  - Dado meta de 2.000 ml e 6 copos de 250 ml, quando abro "Hoje", então vejo 75%.
  - Dado marcar a mesma refeição duas vezes no dia, quando salvo, então prevalece o último status.
- **Testes:** RLS (paciente só escreve o próprio; assistant não lê); unidade da fila offline; e2e com modo offline do Playwright.

### RN-074 — Notificações push
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-078, RN-050
- **Descrição:** Lembretes de refeição e hidratação por Web Push (F-03), configuráveis pelo paciente.
- **Tarefas técnicas:**
  - [ ] Chaves VAPID (segredo no servidor) e `POST /api/push/subscribe`
  - [ ] Pedido de permissão só após ação do usuário (nunca no primeiro carregamento)
  - [ ] Tabelas `push_subscriptions`, `patient_reminder_settings`
  - [ ] Edge Function `push-dispatcher` e workflow `n8n/workflows/patient-push.json`
  - [ ] Adicionar `push` ao enum `message_channel`
- **Arquivos/áreas:** `supabase/functions/push-dispatcher/`, `apps/web/app/(patient)/p/settings/`, `apps/web/public/sw.ts`
- **Critérios de aceite:**
  - Dado almoço às 12:00 sem registro, quando são 12:15, então o paciente recebe 1 push.
  - Dado o almoço já marcado, quando o cron roda, então não há push.
  - Dado horário de silêncio, quando um lembrete cairia nele, então não é enviado.
- **Testes:** unidade da seleção de lembretes; integração com endpoint de push falso; teste manual em Android e iOS (PWA instalado).

### RN-075 — Sugestão de plano alimentar por IA (alimentos da base, cálculo pelo `nutrition-core`)
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-081, RN-082, RN-083, RN-077, RN-087, RN-031
- **Descrição:** Fluxo F-04 completo: parâmetros → sugestão validada e recalculada → rascunho no editor.
- **Tarefas técnicas:**
  - [ ] Tela de parâmetros (pré-preenchida com cálculo energético, restrições e preferências da anamnese)
  - [ ] Seleção SQL de alimentos candidatos com filtros de restrição
  - [ ] Prompt `meal_plan_v1` com exemplos (few-shot) de refeições brasileiras típicas
  - [ ] Chamada via `packages/ai` com saída estruturada
  - [ ] `fitPortions()` em `nutrition-core` (ajuste de porções com limites mín./máx. por item)
  - [ ] Checagem de alérgenos e alertas
  - [ ] Criar `meal_plans` em `draft` e abrir no editor com selo "Sugerido por IA"
  - [ ] Estado de carregamento com streaming de progresso (etapas), timeout 30 s
- **Arquivos/áreas:** `packages/ai/tasks/meal-plan-suggestion.ts`, `packages/ai/prompts/`, `packages/nutrition-core/src/fit-portions.ts`, `apps/web/app/app/patients/[id]/meal-plans/new/`
- **Critérios de aceite:**
  - Dado meta de 1.800 kcal e 5 refeições, quando gero a sugestão, então o rascunho fica entre 1.710 e 1.890 kcal pelo `nutrition-core`.
  - Dado paciente com alergia a amendoim, quando gero a sugestão, então nenhum item contém amendoim ou derivados.
  - Dado o modelo devolver um alimento fora da lista, quando valido, então o item é rejeitado e a geração é refeita ou marcada `invalid_output`.
  - Dado a sugestão gerada, quando consulto `ai_suggestions`, então `input_pseudonymized` não contém nome, e-mail, telefone nem CPF.
- **Testes:** unidade de `fitPortions` (convergência, limites); integração com LLM mockado (respostas válidas, inválidas, fora da base); eval F-06; e2e com mock.

### RN-076 — Resumo de anamnese e histórico por IA
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-081, RN-082, RN-083, RN-077
- **Descrição:** Fluxo F-05 com referências às perguntas de origem e ação explícita para copiar ao prontuário.
- **Tarefas técnicas:**
  - [ ] Prompt `anamnesis_summary_v1` e schema Zod de saída
  - [ ] Painel lateral na anamnese com links para a pergunta de origem
  - [ ] Card de histórico na ficha do paciente (regenerar sob demanda, com data)
  - [ ] Botão "Copiar para evolução" que cria `clinical_notes` com autoria do profissional
- **Arquivos/áreas:** `packages/ai/tasks/anamnesis-summary.ts`, `apps/web/app/app/patients/[id]/anamneses/[aid]/`
- **Critérios de aceite:**
  - Dado uma anamnese respondida, quando clico em "Resumir com IA", então recebo o resumo em até 15 s, com cada item ligado a uma pergunta.
  - Dado o resumo, quando não clico em "Copiar para evolução", então nada é gravado no prontuário.
- **Testes:** integração com LLM mockado; validação Zod; eval com 10 anamneses sintéticas.

### RN-077 — Registro de sugestões e limites de uso por plano
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-057
- **Descrição:** Tabelas `ai_suggestions` e `ai_usage_monthly`, cotas por plano (F-07), tela de uso e registro de aceite/edição/descarte.
- **Tarefas técnicas:**
  - [ ] Migrações + RLS
  - [ ] `check_ai_quota()` e incremento transacional de uso
  - [ ] Cálculo de `edit_distance` entre sugestão e plano publicado (itens adicionados/removidos/alterados)
  - [ ] Feedback 1–5 e comentário opcional após decisão
  - [ ] Tela `/app/settings/ai`
  - [ ] Rate limit por usuário
- **Arquivos/áreas:** `supabase/migrations/*_ai.sql`, `packages/ai/quota.ts`, `apps/web/app/app/settings/ai/`
- **Critérios de aceite:**
  - Dado cota de 60 sugestões/mês e 60 usadas, quando peço a 61ª, então recebo aviso de limite e nenhuma chamada ao LLM é feita.
  - Dado uma geração que falhou, quando conto o uso, então ela não consumiu cota.
  - Dado um assistente, quando consulta `ai_suggestions`, então não vê nada.
- **Testes:** pgTAP de cota e concorrência; RLS; unidade de `edit_distance`.

### RN-078 — Manifest, service worker e cache offline
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-070
- **Descrição:** Tornar o app instalável e utilizável sem rede para consultar o plano e registrar o diário.
- **Tarefas técnicas:**
  - [ ] Serwist (sucessor do next-pwa) com estratégia: shell em cache-first, dados do plano em stale-while-revalidate, APIs de escrita em network-only + fila
  - [ ] Manifest dinâmico por organização (`/manifest.webmanifest` com nome, `theme_color`, ícones gerados do logo)
  - [ ] Página `/p/offline`
  - [ ] Versionamento do SW e aviso "nova versão disponível"
  - [ ] Garantir que dados do paciente no cache sejam apagados no logout
- **Arquivos/áreas:** `apps/web/app/sw.ts`, `apps/web/app/manifest.webmanifest/route.ts`, `apps/web/next.config.ts`
- **Critérios de aceite:**
  - Dado o app instalado e já aberto uma vez, quando fico sem internet, então consigo ver o plano do dia.
  - Dado logout, quando outra pessoa abre o app no mesmo aparelho, então nenhum dado do paciente anterior aparece.
- **Testes:** Lighthouse PWA ≥ 90 no CI; e2e offline; teste de limpeza de cache.

### RN-079 — Marca do nutricionista no app
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-078
- **Descrição:** Logo, cor principal, nome de exibição e mensagem de boas-vindas no app e no ícone instalado.
- **Tarefas técnicas:**
  - [ ] Tela `/app/settings/app-branding` com pré-visualização em moldura de celular
  - [ ] Geração de ícones 192/512 px a partir do logo (Edge Function com `sharp` ou serviço de imagem)
  - [ ] Validação de contraste da cor escolhida (ajuste automático do texto sobre a cor)
  - [ ] Tema aplicado via CSS variables no layout `(patient)`
- **Arquivos/áreas:** `apps/web/app/app/settings/app-branding/`, `supabase/functions/brand-icons/`
- **Critérios de aceite:**
  - Dado logo e cor definidos, quando o paciente instala o app, então o ícone e a cor são os do consultório.
  - Dado uma cor de baixo contraste, quando salvo, então o texto do botão é ajustado para manter contraste AA.
- **Testes:** unidade do cálculo de contraste; e2e visual (snapshot).

### RN-080 — Painel de adesão para o nutricionista
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-073
- **Descrição:** Mostrar como o paciente está seguindo o plano e quem precisa de atenção.
- **Tarefas técnicas:**
  - [ ] Funções SQL: adesão diária (% refeições `done` + 0,5 × `partial`), por refeição, substituições mais usadas, hidratação média vs. meta, dias sem registro
  - [ ] Tela `/app/patients/[id]/adherence` com gráficos de 30 dias
  - [ ] Lista `/app/adherence` com pacientes cuja adesão caiu > 20 pontos na semana ou sem registro há 5 dias
  - [ ] Atalho para enviar mensagem de incentivo (template da Fase 2)
- **Arquivos/áreas:** `supabase/migrations/*_adherence_views.sql`, `apps/web/app/app/adherence/`, `apps/web/app/app/patients/[id]/adherence/`
- **Critérios de aceite:**
  - Dado 5 refeições/dia e 4 marcadas como feitas, quando vejo o dia, então a adesão é 80%.
  - Dado paciente sem registro há 5 dias, quando abro `/app/adherence`, então ele aparece na lista.
- **Testes:** pgTAP das funções; RLS (assistant não vê); e2e com seed.

### RN-081 — Pseudonimização antes do envio ao LLM
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-082
- **Descrição:** Garantir que nenhum dado identificável do paciente saia do servidor para o provedor de IA.
- **Tarefas técnicas:**
  - [ ] `pseudonymize(context)` em `packages/ai/privacy.ts`: allowlist de campos (idade, sexo, medidas, metas, restrições), nunca blocklist
  - [ ] Filtro de PII em texto livre: e-mail, telefone, CPF, CEP, nomes do paciente e familiares conhecidos
  - [ ] Teste "canário": contexto com PII injetada deve sair limpo
  - [ ] Registrar o payload exato enviado em `ai_suggestions.input_pseudonymized`
  - [ ] Documentar o fluxo no `docs/05-seguranca-lgpd.md`
- **Arquivos/áreas:** `packages/ai/privacy.ts`, `packages/ai/__tests__/privacy.test.ts`
- **Critérios de aceite:**
  - Dado uma anamnese com "meu nome é Maria Silva, tel (31) 99999-0000", quando pseudonimizo, então o resultado não contém o nome nem o telefone.
  - Dado qualquer chamada ao LLM, quando inspeciono o código, então ela só aceita um tipo `PseudonymizedContext` (tipagem impede passar dados crus).
- **Testes:** unidade com casos de PII variados (≥ 30 casos); teste de tipo (tsd/expect-type).

### RN-082 — Camada de acesso ao LLM (`packages/ai`)
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-014
- **Descrição:** Cliente único de IA no servidor: escolha de modelo por tarefa, saída estruturada, retries, timeout, medição de tokens/custo/latência e logging sem PII.
- **Tarefas técnicas:**
  - [ ] Interface `LlmProvider` e implementação do provedor escolhido (ADR sobre provedor, região e política de retenção/treinamento)
  - [ ] Função `runTask(task, input, schema)` com timeout, 1 retry em erro transitório, medição de tokens
  - [ ] Tabela de preços por modelo em `pricing.ts`
  - [ ] Chave de API só em variável de ambiente do servidor; proibir import de `packages/ai` em componentes cliente (lint rule `server-only`)
  - [ ] Modo mock para testes e para ambientes locais sem chave
- **Arquivos/áreas:** `packages/ai/`, `docs/adr/0005-llm-provider.md`
- **Critérios de aceite:**
  - Dado um componente cliente que importa `packages/ai`, quando o build roda, então falha.
  - Dado o provedor lento, quando passa o timeout, então a chamada é abortada e registrada como `failed`.
- **Testes:** unidade com provedor mock; teste de build com import proibido.

### RN-083 — Schemas Zod de saída da IA
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-082
- **Descrição:** Contratos de saída versionados para cada tarefa, convertidos em JSON Schema para a saída estruturada do modelo.
- **Tarefas técnicas:**
  - [ ] `MealPlanSuggestionSchema`, `AnamnesisSummarySchema`, `HistorySummarySchema`
  - [ ] Conversão `zod-to-json-schema` para o provedor
  - [ ] Validações semânticas extras (refeições únicas, gramas em faixa, `food_ref` existente)
  - [ ] Mensagens de erro de validação gravadas em `validation_errors`
- **Arquivos/áreas:** `packages/ai/schemas/`
- **Critérios de aceite:**
  - Dado uma saída com campo faltando, quando valido, então `outcome = invalid_output` e o erro fica registrado.
- **Testes:** unidade com saídas válidas e inválidas (fixtures).

### RN-084 — Avaliação de qualidade da IA com casos de teste
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-075, RN-076
- **Descrição:** Fluxo F-06: dataset sintético, métricas automáticas, rubrica com a nutricionista e gate para mudanças de prompt/modelo.
- **Tarefas técnicas:**
  - [ ] 40 casos sintéticos de plano alimentar e 10 de anamnese, revisados pela nutricionista
  - [ ] Script `pnpm ai:eval` com relatório Markdown e gravação em `ai_eval_runs`
  - [ ] Workflow manual no GitHub Actions (usa chave de staging, orçamento máximo por execução)
  - [ ] Planilha/rubrica de avaliação qualitativa e registro das notas
  - [ ] Limiares de aprovação documentados
- **Arquivos/áreas:** `packages/ai/evals/`, `.github/workflows/ai-eval.yml`, `docs/ia/avaliacao.md`
- **Critérios de aceite:**
  - Dado uma nova versão de prompt, quando o eval roda, então o relatório compara com a versão anterior em todas as métricas.
  - Dado violação de restrição em qualquer caso, quando o eval termina, então o resultado é reprovado.
- **Testes:** o próprio eval; unidade das funções de métrica.

### RN-085 — Monitoramento de custo e uso de IA
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-077
- **Descrição:** Visão interna de custo por organização, tarefa e modelo, com alertas.
- **Tarefas técnicas:**
  - [ ] View agregada de custo por mês/organização/tarefa
  - [ ] Alerta (e-mail/Slack via n8n) quando custo de uma organização > 20% do valor do plano ou custo total diário acima do orçamento
  - [ ] Painel interno simples (rota protegida para admins da plataforma)
- **Arquivos/áreas:** `supabase/migrations/*_ai_cost_views.sql`, `n8n/workflows/ai-cost-alert.json`, `apps/web/app/admin/ai/`
- **Critérios de aceite:**
  - Dado uso acima do limiar, quando o job diário roda, então o alerta é enviado uma vez por dia.
- **Testes:** pgTAP das views.

### RN-086 — Convite do paciente e publicação do plano para o app
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-070, RN-035
- **Descrição:** Fluxo F-01 e regras de publicação: o paciente vê apenas o plano publicado ativo e o que o nutricionista decidir compartilhar.
- **Tarefas técnicas:**
  - [ ] Tabela `patient_app_invites`, Edge Function `link-patient-account`
  - [ ] Botões "Convidar para o app" e "Reenviar convite" na ficha
  - [ ] Ao publicar novo plano, o anterior vira `archived`; notificação push/e-mail "Seu novo plano está disponível"
  - [ ] Opções de compartilhamento: mostrar calorias, mostrar evolução de peso, mostrar medidas
  - [ ] Termo de uso do app e registro em `consent_records`
- **Arquivos/áreas:** `supabase/functions/link-patient-account/`, `apps/web/app/(patient)/p/invite/[token]/`, `apps/web/app/app/patients/[id]/app/`
- **Critérios de aceite:**
  - Dado um convite enviado, quando o paciente aceita com o mesmo e-mail, então a conta é vinculada e ele vê o plano publicado.
  - Dado um convite aceito com outro e-mail, quando tenta vincular, então é negado e registrado em auditoria.
  - Dado um novo plano publicado, quando o paciente abre o app, então vê o novo plano e não o arquivado.
- **Testes:** integração da Edge Function; RLS; e2e convite → login → plano.

### RN-087 — Restrições e preferências alimentares estruturadas
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-024, RN-010
- **Descrição:** Transformar alergias, intolerâncias, padrão alimentar e aversões em dados estruturados (necessários para filtrar alimentos e para a IA).
- **Tarefas técnicas:**
  - [ ] Tabela `patient_dietary_profile` (`allergens text[]`, `intolerances text[]`, `diet_pattern`, `disliked_food_ids uuid[]`, `preferred_food_ids uuid[]`, `notes`)
  - [ ] Tabela `food_allergens` (marcação de alérgenos por alimento na base: glúten, lactose, amendoim, castanhas, ovo, soja, peixe, crustáceos...)
  - [ ] Seed de marcação de alérgenos para alimentos da TACO (revisado pela nutricionista)
  - [ ] Preenchimento sugerido a partir da anamnese (mapear perguntas padrão)
  - [ ] Alerta no editor manual de plano quando um item conflita com a restrição
- **Arquivos/áreas:** `supabase/migrations/*_dietary_profile.sql`, `supabase/seed/food_allergens.csv`, `apps/web/app/app/patients/[id]/`
- **Critérios de aceite:**
  - Dado paciente celíaco, quando adiciono pão francês no editor, então aparece alerta de glúten.
- **Testes:** unidade do verificador de conflitos; pgTAP; revisão do seed.

### RN-088 — Interface de revisão da sugestão de IA
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-075
- **Descrição:** Deixar claro o que foi sugerido pela IA, facilitar ajustes e registrar a decisão.
- **Tarefas técnicas:**
  - [ ] Selo "Sugerido por IA — revise antes de publicar" no rascunho
  - [ ] Destaque de itens alterados pelo `fitPortions` e alertas de nutrientes
  - [ ] Ações: "Gerar outra opção para esta refeição", "Descartar sugestão"
  - [ ] Publicar exige confirmação de revisão (checkbox) na primeira vez
- **Arquivos/áreas:** `apps/web/app/app/patients/[id]/meal-plans/[planId]/`
- **Critérios de aceite:**
  - Dado um rascunho gerado por IA, quando tento publicar, então preciso confirmar que revisei.
  - Dado "gerar outra opção" em uma refeição, quando concluído, então só aquela refeição muda e a cota é consumida uma vez.
- **Testes:** e2e com LLM mockado.

### RN-089 — Termos de IA, documentação e ADRs da fase
- **Tipo:** doc
- **Pontos:** 2
- **Depende de:** RN-082, RN-081
- **Descrição:** Atualizar Termos de Uso e Política de Privacidade (provedor de IA como suboperador, finalidade, ausência de treinamento com dados), termo do app do paciente e documentação técnica.
- **Tarefas técnicas:**
  - [ ] ADR 0005 (provedor de LLM) e ADR 0006 (estratégia offline do PWA)
  - [ ] `docs/ia/` com prompts versionados, métricas e limites
  - [ ] Atualizar `docs/04-modelo-dados.md` e `docs/05-seguranca-lgpd.md`
  - [ ] Texto para o nutricionista explicando como a IA funciona e seus limites
- **Arquivos/áreas:** `docs/`
- **Critérios de aceite:**
  - Dado a fase concluída, quando um nutricionista lê a página de ajuda da IA, então entende que a decisão final é dele e quais dados são enviados.
- **Testes:** —

## Sequência semanal

| Semana | Itens |
|---|---|
| 1 | RN-070, RN-078, RN-086, RN-082 |
| 2 | RN-071, RN-079, RN-087, RN-081, RN-083 |
| 3 | RN-073, RN-072, RN-077 |
| 4 | RN-074, RN-080, RN-075 (início) |
| 5 | RN-075 (fim), RN-088, RN-076 |
| 6 | RN-084, RN-085, RN-089, testes em dispositivos reais (Android/iOS), ajustes do beta |

## Critério de pronto da fase

- Paciente convidado instala o PWA, entra por magic link, vê o plano do dia (inclusive offline), marca refeições, registra água, gera lista de compras e recebe lembretes push.
- Nutricionista vê a adesão de cada paciente e a lista de quem precisa de atenção.
- Sugestão de plano por IA passa no eval: 0 alimentos fora da base, 0 violações de restrição, erro de kcal ≤ 5% em todos os casos.
- Nenhum dado identificável é enviado ao LLM (testes de pseudonimização passando no CI).
- Cotas por plano aplicadas e custo de IA visível por organização.
- RLS do papel paciente testada: não lê rascunhos, dados de outros pacientes, notas clínicas, financeiro nem sugestões de IA.

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| IA sugere alimento inexistente ou inadequado | Alto | Lista fechada de candidatos, validação Zod, filtro de alérgenos, revisão obrigatória |
| Cálculo nutricional "alucinado" | Alto | LLM nunca calcula; `nutrition-core` recalcula e ajusta porções |
| Vazamento de PII ao provedor de IA | Alto (LGPD) | Pseudonimização por allowlist, tipagem `PseudonymizedContext`, testes canário |
| Custo de IA acima do previsto | Médio | Cotas, modelo menor para resumos, alerta de custo, cache de candidatos |
| Push no iOS limitado | Médio | Instrução de instalação; e-mail/WhatsApp como fallback; avaliar Expo se necessário |
| Baixo engajamento no app | Alto (retenção) | Registro em 1 toque, lembretes, painel de adesão para o nutricionista agir |
| Dados no cache de aparelho compartilhado | Médio | Limpeza de cache no logout, sessão com expiração |
| Responsabilidade profissional sobre plano gerado | Alto | Termos claros, selo de IA, confirmação de revisão antes de publicar |

## Métricas a acompanhar

| Métrica | Meta inicial |
|---|---|
| % de pacientes convidados que ativam o app | > 60% |
| Pacientes ativos semanais (≥ 3 dias com registro/semana) | > 40% dos ativados |
| Adesão média registrada | acompanhar tendência por paciente |
| Retenção do paciente no app em 30 dias | > 50% |
| Tempo para montar plano com IA vs. sem IA | redução de 50% |
| Taxa de aceite da sugestão (`accepted` + `accepted_with_edits`) | > 70% |
| `edit_distance` médio das sugestões aceitas | < 0,3 |
| Taxa de `invalid_output` | < 3% |
| Latência p95 da sugestão de plano | < 20 s |
| Custo médio de IA por organização/mês | < 10% do preço do plano |
| Churn de nutricionistas com > 10 pacientes no app vs. sem app | comparar (hipótese de retenção) |
