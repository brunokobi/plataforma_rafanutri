# Fase 2 — Gestão do consultório

## Objetivo

Transformar o MVP clínico em um produto vendável e com baixo trabalho manual: a plataforma lembra o paciente das consultas, envia o link de anamnese, controla o dinheiro do consultório, mostra quem precisa voltar e **cobra a própria assinatura do SaaS** sem intervenção humana.

Duração estimada: **4 semanas** (1 a 2 devs full-stack). Ao final da fase começa o **lançamento pago**.

## Escopo / Fora de escopo

**Escopo**
- n8n self-hosted, conectado ao Supabase por webhooks assinados.
- WhatsApp Business (API oficial via provedor) e e-mail transacional para lembretes de consulta, retorno e link de anamnese.
- Preferências de comunicação e opt-out (LGPD), log de todas as mensagens enviadas.
- Financeiro do consultório: recebimentos, despesas simples, fluxo de caixa mensal, pacotes de consultas, recibo em PDF.
- CRM: funil de pacientes e lista de retornos atrasados.
- Planos do SaaS (Essencial, Profissional, Clínica), trial, cobrança recorrente via gateway, régua de cobrança e bloqueio por inadimplência.
- Sincronização opcional com Google Calendar (sentido Rafanutri → Google).

**Fora de escopo**
- Emissão de NFS-e (avaliar na Fase 6; o Asaas oferece, mas exige configuração fiscal por cliente).
- Cobrança online do paciente pelo nutricionista (Pix/cartão em nome do consultório) — fica para depois; nesta fase o financeiro do consultório é **registro manual**.
- Sincronização bidirecional com Google Calendar.
- Chatbot no WhatsApp (respostas automáticas além de confirmação/cancelamento).
- Plano Enterprise UAN (Fase 5).

## Pré-requisitos

| Item | Por quê |
|---|---|
| RN-004, RN-007, RN-008 | Organizações, papéis e RLS — todas as tabelas novas seguem o mesmo padrão |
| RN-009 | Auditoria de alterações em dados financeiros |
| RN-014 | CI para migrações e testes de RLS |
| RN-020, RN-021 | Pacientes e consentimento (base legal para mensagens) |
| RN-022 | Agenda — origem dos lembretes |
| RN-026 | Link público de anamnese — reaproveitado pelo envio automático |
| RN-036 | Infraestrutura de PDF — reaproveitada no recibo |

## Gateway de pagamento — recomendação

**Recomendado: Asaas.**

| Critério | Asaas | Mercado Pago | Stripe |
|---|---|---|---|
| Assinatura recorrente com Pix, boleto e cartão | Nativo para os três | Cartão bom; Pix recorrente limitado | Cartão excelente; Pix e boleto sem recorrência nativa equivalente |
| Foco no público (profissional liberal BR, PF/PJ) | Alto | Médio | Baixo |
| Régua de cobrança e notificações prontas | Sim | Parcial | Parcial (Billing, foco internacional) |
| NFS-e integrada (futuro) | Sim | Não | Não |
| Webhooks e sandbox | Sim | Sim | Sim (melhor DX) |
| Taxas | Competitivas para Pix/boleto | Competitivas | Mais altas no Brasil |

Justificativa: o nutricionista autônomo brasileiro paga muito por Pix e boleto; o Asaas cobre os três meios em assinatura recorrente, tem régua de cobrança e abre caminho para NFS-e. O Stripe fica como alternativa se a Rafanutri for internacionalizar. A integração fica atrás de uma interface `BillingProvider` em `packages/billing` para permitir troca.

## Modelo de dados

```sql
-- =========================================================
-- Comunicação
-- =========================================================
create type message_channel as enum ('whatsapp', 'email');
create type message_status  as enum ('queued', 'sent', 'delivered', 'read', 'failed', 'skipped_opt_out');
create type message_kind    as enum ('appointment_reminder', 'appointment_confirmation',
                                     'return_reminder', 'anamnesis_link', 'receipt',
                                     'billing_notice', 'generic');

create table communication_preferences (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  patient_id       uuid not null references patients(id) on delete cascade,
  whatsapp_opt_in  boolean not null default false,
  email_opt_in     boolean not null default true,
  opt_in_at        timestamptz,
  opt_out_at       timestamptz,
  opt_out_reason   text,
  source           text not null default 'panel',   -- panel | anamnesis_form | whatsapp_reply
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (patient_id)
);

create table message_templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references organizations(id) on delete cascade, -- null = padrão da plataforma
  kind             message_kind not null,
  channel          message_channel not null,
  provider_template_name text,          -- nome aprovado na Meta (WhatsApp)
  subject          text,                -- e-mail
  body             text not null,       -- com variáveis {{patient_first_name}}, {{starts_at}}...
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table automation_settings (
  organization_id          uuid primary key references organizations(id) on delete cascade,
  reminder_enabled         boolean not null default true,
  reminder_hours_before    int[]   not null default '{24,2}',
  return_reminder_enabled  boolean not null default true,
  return_reminder_days     int     not null default 30,
  anamnesis_auto_send      boolean not null default true,
  anamnesis_days_before    int     not null default 2,
  quiet_hours_start        time    not null default '21:00',
  quiet_hours_end          time    not null default '08:00',
  updated_at               timestamptz not null default now()
);

create table message_logs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  patient_id         uuid references patients(id) on delete set null,
  appointment_id     uuid references appointments(id) on delete set null,
  kind               message_kind not null,
  channel            message_channel not null,
  status             message_status not null default 'queued',
  idempotency_key    text not null,          -- ex.: appointment_reminder:<appointment_id>:24h
  provider_message_id text,
  rendered_body_hash text,                    -- hash do corpo, não o texto (minimização)
  error_code         text,
  error_message      text,
  attempts           int not null default 0,
  sent_at            timestamptz,
  delivered_at       timestamptz,
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  unique (idempotency_key)
);
create index on message_logs (organization_id, created_at desc);
create index on message_logs (patient_id);
create index on message_logs (status) where status in ('queued', 'failed');

-- =========================================================
-- Financeiro do consultório
-- =========================================================
create type payment_method as enum ('pix', 'cash', 'credit_card', 'debit_card', 'bank_transfer', 'boleto', 'other');
create type transaction_type as enum ('income', 'expense');

create table service_packages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,             -- ex.: "Trimestral — 3 consultas"
  sessions_count   int  not null check (sessions_count > 0),
  price_cents      int  not null check (price_cents >= 0),
  validity_days    int,                       -- null = sem validade
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table patient_packages (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  patient_id         uuid not null references patients(id) on delete cascade,
  service_package_id uuid not null references service_packages(id),
  sessions_total     int not null,
  sessions_used      int not null default 0 check (sessions_used <= sessions_total),
  starts_on          date not null,
  expires_on         date,
  status             text not null default 'active', -- active | finished | expired | canceled
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on patient_packages (patient_id, status);

alter table appointments add column patient_package_id uuid references patient_packages(id);
alter table appointments add column price_cents int;

create table financial_categories (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references organizations(id) on delete cascade, -- null = padrão
  type             transaction_type not null,
  name             text not null
);

create table financial_transactions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  type               transaction_type not null,
  category_id        uuid references financial_categories(id),
  patient_id         uuid references patients(id) on delete set null,
  appointment_id     uuid references appointments(id) on delete set null,
  patient_package_id uuid references patient_packages(id) on delete set null,
  description        text not null,
  amount_cents       int  not null check (amount_cents > 0),
  method             payment_method,
  due_on             date not null,
  paid_on            date,                   -- null = em aberto
  receipt_number     int,                    -- sequencial por organização
  receipt_pdf_path   text,
  created_by         uuid not null references profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, receipt_number)
);
create index on financial_transactions (organization_id, due_on);
create index on financial_transactions (organization_id, paid_on);

create view monthly_cash_flow with (security_invoker = true) as
select organization_id,
       date_trunc('month', coalesce(paid_on, due_on))::date as month,
       sum(amount_cents) filter (where type = 'income'  and paid_on is not null) as income_paid_cents,
       sum(amount_cents) filter (where type = 'expense' and paid_on is not null) as expense_paid_cents,
       sum(amount_cents) filter (where type = 'income'  and paid_on is null)     as income_open_cents
from financial_transactions
group by 1, 2;

-- =========================================================
-- CRM
-- =========================================================
create type crm_stage as enum ('lead', 'scheduled', 'first_visit', 'follow_up', 'inactive', 'lost');

alter table patients add column crm_stage crm_stage not null default 'scheduled';
alter table patients add column crm_stage_changed_at timestamptz not null default now();
alter table patients add column lead_source text;          -- instagram, indicação, google...
alter table patients add column next_return_due_on date;   -- calculado após cada consulta

create table crm_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  from_stage      crm_stage,
  to_stage        crm_stage not null,
  note            text,
  actor_id        uuid references profiles(id),
  created_at      timestamptz not null default now()
);

-- =========================================================
-- Assinatura do SaaS (Rafanutri ↔ cliente)
-- =========================================================
create type subscription_status as enum ('trialing', 'active', 'past_due', 'suspended', 'canceled');

create table plans (
  code                text primary key,       -- essencial | profissional | clinica
  name                text not null,
  price_cents_monthly int  not null,
  price_cents_yearly  int,
  max_active_patients int,                    -- null = ilimitado
  max_members         int,
  features            jsonb not null default '{}', -- {"ai": false, "whatsapp": false, ...}
  is_public           boolean not null default true
);

create table subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null unique references organizations(id) on delete cascade,
  plan_code                text not null references plans(code),
  status                   subscription_status not null default 'trialing',
  billing_cycle            text not null default 'monthly', -- monthly | yearly
  trial_ends_at            timestamptz,
  current_period_end       timestamptz,
  past_due_since           timestamptz,
  provider                 text not null default 'asaas',
  provider_customer_id     text,
  provider_subscription_id text,
  canceled_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table billing_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  organization_id   uuid references organizations(id) on delete set null,
  payload           jsonb not null,
  processed_at      timestamptz,
  error             text,
  received_at       timestamptz not null default now(),
  unique (provider, provider_event_id)   -- idempotência de webhook
);

-- =========================================================
-- Google Calendar
-- =========================================================
create table calendar_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  profile_id            uuid not null references profiles(id) on delete cascade,
  provider              text not null default 'google',
  calendar_id           text not null,
  refresh_token_secret_id uuid not null,  -- referência ao Supabase Vault, nunca o token em texto
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (profile_id, provider)
);
alter table appointments add column external_calendar_event_id text;
```

### Políticas RLS principais

```sql
-- Padrão para tabelas da organização (repetir em todas as tabelas acima com organization_id)
alter table financial_transactions enable row level security;

create policy fin_select on financial_transactions for select
  using (has_role(organization_id, array['owner','nutritionist','assistant']));
create policy fin_write on financial_transactions for insert
  with check (has_role(organization_id, array['owner','nutritionist','assistant']));
create policy fin_update on financial_transactions for update
  using (has_role(organization_id, array['owner','nutritionist','assistant']));
create policy fin_delete on financial_transactions for delete
  using (has_role(organization_id, array['owner']));   -- só owner exclui lançamento

-- Assinatura: leitura para membros, escrita só via service_role (webhook)
alter table subscriptions enable row level security;
create policy sub_select on subscriptions for select using (is_member(organization_id));
-- sem policy de insert/update para authenticated

-- billing_events: sem acesso para authenticated (somente service_role)
alter table billing_events enable row level security;

-- message_logs: leitura para membros; escrita só service_role (n8n/Edge Function)
alter table message_logs enable row level security;
create policy msg_select on message_logs for select using (is_member(organization_id));

-- communication_preferences: membros leem/escrevem; paciente lê e atualiza a própria (opt-out)
create policy pref_patient on communication_preferences for update
  using (patient_id in (select id from patients where auth_user_id = auth.uid()));

-- plans: leitura pública para authenticated
alter table plans enable row level security;
create policy plans_read on plans for select using (true);
```

Função de bloqueio usada pelas políticas de escrita das tabelas clínicas:

```sql
create function org_is_writable(org uuid) returns boolean
language sql stable security definer as $$
  select status in ('trialing','active','past_due')
  from subscriptions where organization_id = org
$$;
-- Políticas de insert/update de patients, meal_plans, appointments etc. passam a incluir
-- "and org_is_writable(organization_id)". Leitura e exportação continuam liberadas (LGPD).
```

## Rotas e telas

| Rota Next.js | Tela | Papel que acessa |
|---|---|---|
| `/app/settings/automations` | Configuração de lembretes, horários de silêncio, envio automático de anamnese | owner |
| `/app/settings/messages` | Modelos de mensagem (visualizar/editar variáveis) | owner |
| `/app/settings/integrations/whatsapp` | Status da conexão WhatsApp e número remetente | owner |
| `/app/settings/integrations/google-calendar` | Conectar/desconectar Google Calendar | owner, nutritionist (próprio calendário) |
| `/app/settings/billing` | Plano atual, trial, faturas, troca de plano, cancelamento | owner |
| `/app/settings/billing/checkout` | Escolha de plano e meio de pagamento | owner |
| `/app/messages` | Log de mensagens com filtros e status de entrega | owner, nutritionist, assistant |
| `/app/finance` | Resumo do mês, fluxo de caixa, a receber | owner, nutritionist, assistant |
| `/app/finance/transactions` | Lista de lançamentos e filtros | owner, nutritionist, assistant |
| `/app/finance/transactions/new` | Novo recebimento/despesa | owner, nutritionist, assistant |
| `/app/finance/packages` | Pacotes de consultas (cadastro) | owner |
| `/app/patients/[id]/finance` | Pacotes e pagamentos do paciente, emitir recibo | owner, nutritionist, assistant |
| `/app/crm` | Kanban do funil de pacientes | owner, nutritionist, assistant |
| `/app/crm/returns` | Retornos atrasados e a vencer | owner, nutritionist, assistant |
| `/m/[token]` | Página pública de confirmação/cancelamento de consulta e opt-out | público (token) |
| `/api/webhooks/billing` | Webhook do gateway (Route Handler) | gateway (assinado) |
| `/api/webhooks/whatsapp-status` | Status de entrega do provedor WhatsApp | provedor (assinado) |
| `/app/blocked` | Aviso de conta suspensa com link para regularizar | todos os membros |

## Integrações/fluxos

### Arquitetura de mensagens

```
Supabase (pg_cron / trigger) ──webhook assinado (HMAC)──▶ n8n ──▶ provedor WhatsApp / e-mail
            ▲                                               │
            └──────── Edge Function `message-callback` ◀────┘ (status, ids)
```

- O **Supabase decide o que enviar** (consulta SQL em função `due_messages()`), o **n8n só executa** o envio. Assim a regra de negócio fica versionada em SQL e testável.
- O n8n acessa o Supabase com uma chave de serviço restrita a uma Edge Function (`messaging-gateway`), nunca com `service_role` direto no banco.
- Todo envio passa por `message_logs` com `idempotency_key` única: um reenvio do mesmo evento é descartado pelo `unique`.

### Provedor de WhatsApp

Usar a **WhatsApp Business Platform (Cloud API da Meta)** via provedor/BSP brasileiro (ex.: Z-API não é oficial — **evitar**; preferir BSP oficial como Twilio, Gupshup, 360dialog ou Blip). Decisão final no item RN-050 após comparar custo por conversa e facilidade de aprovação de templates. Mensagens iniciadas pela empresa exigem **templates aprovados** pela Meta (categoria *utility*).

### WF-01 — Lembrete de consulta

- **Gatilho:** Cron no n8n a cada 15 min → `POST /functions/v1/messaging-gateway/due?kind=appointment_reminder`.
- **Passos:**
  1. Edge Function chama `due_messages('appointment_reminder')`: consultas com `status = 'scheduled'`, `starts_at` dentro da janela de cada valor de `reminder_hours_before` (±15 min), paciente com opt-in no canal, fora do horário de silêncio, organização com `features.whatsapp = true` e assinatura não suspensa.
  2. Para cada item, insere em `message_logs` com `idempotency_key = appointment_reminder:<appointment_id>:<hours>h` (`on conflict do nothing returning id`). Só retorna ao n8n os inseridos.
  3. n8n renderiza o template (variáveis: primeiro nome, data, hora, nome do profissional, link `/m/<token>` para confirmar/cancelar).
  4. Envia por WhatsApp; se o paciente não tem WhatsApp opt-in, envia por e-mail.
  5. Chama `message-callback` com `provider_message_id` e `status = sent`.
- **Tratamento de erro:** até 3 tentativas com backoff (1, 5, 15 min) dentro do n8n; após falha final, `status = failed` com `error_code`; se o erro for "número inválido", desativa `whatsapp_opt_in` e registra motivo. Workflow de erro global do n8n notifica o canal de alertas.
- **Idempotência:** `unique (idempotency_key)` em `message_logs`; o n8n nunca envia sem um `id` retornado pela inserção.

### WF-02 — Confirmação/cancelamento pelo paciente

- **Gatilho:** paciente abre `/m/<token>` (link no lembrete) ou responde ao botão do template WhatsApp (webhook do provedor → n8n).
- **Passos:** valida token (JWT curto, assinado, com `appointment_id` e expiração em `starts_at`); atualiza `appointments.status` para `confirmed` ou `canceled_by_patient`; registra em `audit_logs`; notifica o nutricionista (notificação no painel + e-mail opcional).
- **Erro:** token expirado → página informa e mostra contato do consultório.
- **Idempotência:** confirmar duas vezes não muda nada; cancelar uma consulta já cancelada é no-op.

### WF-03 — Lembrete de retorno

- **Gatilho:** Cron diário às 09:00 (America/Sao_Paulo).
- **Passos:** `due_messages('return_reminder')` seleciona pacientes com `next_return_due_on <= hoje`, sem consulta futura agendada, `crm_stage in ('first_visit','follow_up')`, sem lembrete de retorno nos últimos 15 dias. Envia template com link de agendamento (WhatsApp do consultório ou página de agendamento, se existir).
- **Erro:** igual ao WF-01.
- **Idempotência:** `return_reminder:<patient_id>:<next_return_due_on>`.

### WF-04 — Envio automático do link de anamnese

- **Gatilho:** Cron a cada hora.
- **Passos:** consultas do tipo `first` daqui a `anamnesis_days_before` dias, sem anamnese `answered`; gera (ou reaproveita) anamnese com `public_token` (RN-026) e envia o link.
- **Idempotência:** `anamnesis_link:<appointment_id>`.

### WF-05 — Status de entrega

- **Gatilho:** webhook do provedor WhatsApp/e-mail → `/api/webhooks/whatsapp-status` (valida assinatura) → Edge Function `message-callback`.
- **Passos:** localiza por `provider_message_id`, atualiza `status`, `delivered_at`, `read_at`. Status só avança (queued < sent < delivered < read); `failed` pode substituir `sent`.
- **Idempotência:** atualização condicional pela ordem de status.

### WF-06 — Opt-out por resposta

- **Gatilho:** mensagem recebida contendo "SAIR", "PARAR", "STOP" (webhook de entrada do provedor).
- **Passos:** localiza paciente pelo telefone (E.164) dentro da organização dona do número, `whatsapp_opt_in = false`, `opt_out_at = now()`, `source = 'whatsapp_reply'`; responde confirmação única.
- **Idempotência:** se já está opt-out, não responde de novo.

### WF-07 — Webhooks de cobrança do SaaS (Asaas)

- **Gatilho:** `POST /api/webhooks/billing` (token de autenticação do Asaas no header).
- **Passos:**
  1. Grava em `billing_events` (`unique (provider, provider_event_id)`); se conflito, responde 200 e encerra.
  2. Mapeia evento → transição: `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` → `active` e avança `current_period_end`; `PAYMENT_OVERDUE` → `past_due` (marca `past_due_since`); `SUBSCRIPTION_DELETED` → `canceled`.
  3. Marca `processed_at`. Responde 200 rapidamente (processamento síncrono e curto).
- **Erro:** exceção grava `error` e responde 500 para o gateway reenviar; job diário reprocessa `billing_events` com `processed_at is null`.
- **Idempotência:** chave única do evento + transições de estado que não regridem (`canceled` é terminal).

### WF-08 — Régua de inadimplência

- **Gatilho:** pg_cron diário.
- **Passos:** `past_due` há 3 dias → e-mail de aviso; 7 dias → aviso no painel; **10 dias → `suspended`** (somente leitura e exportação); 60 dias suspenso → e-mail sobre retenção e possibilidade de exportar dados. Trial expirado sem pagamento → `suspended`.
- **Idempotência:** `billing_notice:<org_id>:<etapa>:<past_due_since>`.

### WF-09 — Google Calendar (Rafanutri → Google)

- **Gatilho:** trigger `after insert/update/delete` em `appointments` → `pg_net` chama Edge Function `calendar-sync`.
- **Passos:** busca `calendar_connections` do nutricionista; lê refresh token do Vault; cria/atualiza/exclui evento com título **sem dado clínico** ("Consulta — Maria S."), guarda `external_calendar_event_id`.
- **Erro:** token revogado → `is_active = false` e aviso no painel; erros 5xx → fila de retry (tabela `outbox` simples) com 5 tentativas.
- **Idempotência:** se `external_calendar_event_id` existe, faz update em vez de criar.

## Itens do backlog

### RN-050 — Subir n8n (self-hosted) e conectar ao Supabase
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-003, RN-014
- **Descrição:** Provisionar n8n em produção e staging com persistência em Postgres próprio, HTTPS, autenticação e backup, e conectá-lo ao Supabase por Edge Function com segredo compartilhado.
- **Tarefas técnicas:**
  - [ ] Hospedagem conforme [ADR 0004](../adr/0004-infraestrutura-hospedagem.md): instância **dedicada** da Rafanutri na VPS existente (Coolify + Traefik), separada do n8n pessoal, com `N8N_ENCRYPTION_KEY`, credenciais e banco próprios
  - [ ] Docker Compose com n8n + Postgres próprio, em rede Docker exclusiva; roteamento pelo Traefik já existente (labels), TLS por Let's Encrypt
  - [ ] Monitor externo de disponibilidade (evitar reclamação da instância por ociosidade)
  - [ ] Payloads enviados ao n8n limitados ao mínimo (primeiro nome, telefone, data/hora, link); nada clínico
  - [ ] Variáveis: `N8N_ENCRYPTION_KEY`, `WEBHOOK_URL`, autenticação de usuário, `GENERIC_TIMEZONE=America/Sao_Paulo`
  - [ ] Edge Function `messaging-gateway` com validação HMAC (`X-Rafanutri-Signature`)
  - [ ] Workflow de erro global (alerta por e-mail/Slack)
  - [ ] Exportar workflows como JSON em `n8n/workflows/` e script de import
  - [ ] Comparar BSPs de WhatsApp (custo por conversa, aprovação de template, SLA) e registrar ADR
- **Arquivos/áreas:** `n8n/docker-compose.yml`, `n8n/workflows/`, `supabase/functions/messaging-gateway/`, `docs/adr/0005-whatsapp-provider.md`
- **Critérios de aceite:**
  - Dado o n8n em staging, quando chama `messaging-gateway` sem assinatura válida, então recebe 401.
  - Dado um workflow que falha, quando a falha ocorre, então o alerta chega ao canal configurado em até 5 min.
  - Dado o repositório, quando um workflow é alterado no n8n, então o JSON exportado é commitado em `n8n/workflows/`.
- **Testes:** integração da Edge Function (assinatura válida/inválida); smoke test do n8n no deploy.

### RN-051 — Lembrete de consulta por WhatsApp e e-mail
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-050, RN-059, RN-060, RN-063
- **Descrição:** Implementar WF-01 e WF-02: lembretes configuráveis antes da consulta, com link para confirmar/cancelar.
- **Tarefas técnicas:**
  - [ ] Função SQL `due_messages(kind)` com regras de janela, opt-in, silêncio e plano
  - [ ] Inserção idempotente em `message_logs`
  - [ ] Workflow n8n `appointment-reminder.json` (cron 15 min, envio, fallback e-mail, retries)
  - [ ] Token assinado para `/m/[token]` e página de confirmar/cancelar
  - [ ] Novos status em `appointments`: `confirmed`, `canceled_by_patient`
  - [ ] Notificação ao nutricionista quando o paciente cancela
- **Arquivos/áreas:** `supabase/migrations/*_messaging.sql`, `supabase/functions/messaging-gateway/`, `n8n/workflows/appointment-reminder.json`, `apps/web/app/m/[token]/`
- **Critérios de aceite:**
  - Dado uma consulta amanhã às 10:00 e lembrete de 24h ativo, quando o cron roda às 10:00 de hoje, então o paciente recebe exatamente 1 mensagem.
  - Dado o mesmo cron rodando duas vezes na janela, quando processa, então não há mensagem duplicada.
  - Dado paciente sem opt-in de WhatsApp, quando o lembrete é devido, então ele recebe por e-mail.
  - Dado o horário de silêncio 21:00–08:00, quando um lembrete de 2h cairia às 07:00, então ele não é enviado e fica como `skipped`.
  - Dado o paciente clicar em "Cancelar", quando confirma, então a consulta fica `canceled_by_patient` e o nutricionista é notificado.
- **Testes:** unidade da `due_messages` (pgTAP) com cenários de janela; integração do token; e2e da página `/m/[token]`.

### RN-052 — Lembrete de retorno e envio de link de anamnese
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-051, RN-026, RN-056
- **Descrição:** WF-03 e WF-04 — lembrar pacientes de retornos vencidos e enviar automaticamente o link de anamnese antes da primeira consulta.
- **Tarefas técnicas:**
  - [ ] Calcular `next_return_due_on` ao concluir consulta (padrão da organização, editável na consulta)
  - [ ] Regras em `due_messages('return_reminder')` e `due_messages('anamnesis_link')`
  - [ ] Workflows `return-reminder.json` e `anamnesis-link.json`
  - [ ] Botão manual "Enviar anamnese agora" na ficha do paciente
- **Arquivos/áreas:** `supabase/migrations/`, `n8n/workflows/`, `apps/web/app/app/patients/[id]/`
- **Critérios de aceite:**
  - Dado paciente com retorno vencido e sem consulta futura, quando o cron diário roda, então recebe 1 lembrete e não recebe outro por 15 dias.
  - Dado primeira consulta em 2 dias sem anamnese respondida, quando o cron roda, então o link é enviado uma única vez.
  - Dado paciente com anamnese já respondida, quando o cron roda, então nada é enviado.
- **Testes:** pgTAP das regras; integração do workflow com provedor em modo sandbox.

### RN-053 — Financeiro: recebimentos e fluxo de caixa
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-008, RN-009
- **Descrição:** Registro de receitas e despesas, contas a receber e fluxo de caixa mensal do consultório.
- **Tarefas técnicas:**
  - [ ] Migração `financial_categories`, `financial_transactions`, view `monthly_cash_flow` + RLS
  - [ ] Seed de categorias padrão (Consulta, Pacote, Aluguel, Software, Marketing...)
  - [ ] Telas `/app/finance`, lista e formulário (Zod: valor > 0, datas válidas)
  - [ ] "Registrar pagamento" direto na consulta concluída (pré-preenche paciente e valor)
  - [ ] Gráfico de 6 meses (receitas × despesas) e card "a receber"
  - [ ] Exportação CSV do período
  - [ ] Valores sempre em centavos (inteiro) e formatação `pt-BR`
- **Arquivos/áreas:** `supabase/migrations/*_finance.sql`, `apps/web/app/app/finance/`, `packages/db`, `packages/ui`
- **Critérios de aceite:**
  - Dado 3 recebimentos pagos em março, quando abro o fluxo de março, então o total bate com a soma em centavos.
  - Dado um lançamento em aberto com vencimento passado, quando abro "a receber", então ele aparece como atrasado.
  - Dado um assistente, quando tenta excluir um lançamento, então a operação é negada.
- **Testes:** RLS (outra organização não lê; assistente não exclui); unidade de formatação monetária; e2e de lançamento → fluxo.

### RN-054 — Pacotes de consultas
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-053, RN-022
- **Descrição:** Cadastrar pacotes, vender a um paciente e consumir sessões automaticamente quando a consulta é concluída.
- **Tarefas técnicas:**
  - [ ] Migração `service_packages`, `patient_packages`, colunas em `appointments`
  - [ ] Venda do pacote gera `financial_transactions` (à vista ou parcelas)
  - [ ] Trigger: consulta `completed` com `patient_package_id` incrementa `sessions_used`; cancelamento reverte
  - [ ] Job diário marca pacotes `expired`
  - [ ] Aviso "última sessão do pacote" na agenda
- **Arquivos/áreas:** `supabase/migrations/`, `apps/web/app/app/finance/packages/`, `apps/web/app/app/patients/[id]/finance/`
- **Critérios de aceite:**
  - Dado pacote de 3 sessões, quando 3 consultas são concluídas, então o pacote fica `finished` e uma 4ª consulta não pode usá-lo.
  - Dado uma consulta concluída por engano, quando é revertida, então `sessions_used` diminui.
- **Testes:** pgTAP do trigger; unidade da validação; e2e venda → consumo.

### RN-055 — Recibo em PDF
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-053, RN-036
- **Descrição:** Emitir recibo numerado com dados do profissional (nome, CRN, CPF/CNPJ), paciente, valor por extenso e serviço.
- **Tarefas técnicas:**
  - [ ] Numeração sequencial por organização (função com lock: `next_receipt_number(org)`)
  - [ ] Template PDF reaproveitando o gerador do RN-036
  - [ ] Função de valor por extenso em `packages/utils/currency-in-words.ts`
  - [ ] Armazenar em bucket privado `receipts/` e enviar por e-mail/WhatsApp (kind `receipt`)
- **Arquivos/áreas:** `apps/web/lib/pdf/receipt.tsx`, `packages/utils`, `supabase/migrations/`
- **Critérios de aceite:**
  - Dado um recebimento pago, quando emito o recibo, então o PDF tem número único e o valor por extenso correto.
  - Dado duas emissões simultâneas, quando concluem, então os números não se repetem.
- **Testes:** unidade de valor por extenso (0,01; 1.000,00; 1.234.567,89); integração da numeração concorrente.

### RN-056 — CRM: funil e retornos atrasados
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-020, RN-022
- **Descrição:** Kanban do ciclo de vida do paciente e lista de retornos vencidos/a vencer.
- **Tarefas técnicas:**
  - [ ] Colunas em `patients` e tabela `crm_events`
  - [ ] Transições automáticas: agendar 1ª consulta → `scheduled`; concluir 1ª → `first_visit`; concluir retorno → `follow_up`; 90 dias sem consulta → `inactive` (job diário)
  - [ ] Kanban com drag-and-drop (dnd-kit) registrando `crm_events`
  - [ ] Cadastro rápido de lead (nome, telefone, origem)
  - [ ] `/app/crm/returns` com filtros (vencidos, próximos 7/30 dias) e ação "enviar lembrete"
  - [ ] Indicadores: conversão lead → 1ª consulta, origem dos leads
- **Arquivos/áreas:** `supabase/migrations/*_crm.sql`, `apps/web/app/app/crm/`, `packages/ui/kanban`
- **Critérios de aceite:**
  - Dado paciente sem consulta há 90 dias, quando o job roda, então ele vai para `inactive` com evento registrado.
  - Dado um lead arrastado para "Perdido", quando confirmo, então o motivo é salvo em `crm_events.note`.
- **Testes:** pgTAP das transições; e2e do kanban; RLS.

### RN-057 — Planos do SaaS, trial e cobrança recorrente
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-004, RN-062
- **Descrição:** Planos, trial de 14 dias sem cartão, checkout e assinatura recorrente via Asaas (Pix, boleto, cartão), troca e cancelamento de plano, e aplicação de limites por plano.
- **Tarefas técnicas:**
  - [ ] Migração `plans`, `subscriptions` + seed dos planos
  - [ ] Criar `subscriptions` em `trialing` ao criar a organização (trigger)
  - [ ] Interface `BillingProvider` e implementação `AsaasProvider` (criar cliente, assinatura, trocar plano, cancelar, buscar faturas)
  - [ ] Checkout em `/app/settings/billing/checkout` (dados de cobrança, CPF/CNPJ, meio de pagamento)
  - [ ] Tela de faturas com link de pagamento (Pix/boleto)
  - [ ] Helper `getEntitlements(orgId)` e verificação de limites (pacientes ativos, membros, features)
  - [ ] Upgrade imediato; downgrade no fim do ciclo; cancelamento mantém acesso até `current_period_end`
  - [ ] Sandbox Asaas em staging
- **Arquivos/áreas:** `packages/billing/`, `apps/web/app/app/settings/billing/`, `supabase/migrations/*_billing.sql`
- **Critérios de aceite:**
  - Dado uma nova organização, quando é criada, então está em `trialing` com `trial_ends_at = +14 dias`.
  - Dado o plano Essencial com limite de pacientes ativos, quando o limite é atingido, então o cadastro de novo paciente mostra aviso de upgrade.
  - Dado pagamento confirmado no sandbox, quando o webhook chega, então a assinatura fica `active`.
  - Dado o cancelamento, quando confirmado, então o acesso continua até o fim do período pago.
- **Testes:** unidade de `getEntitlements`; integração com sandbox Asaas; e2e trial → checkout → ativo.

### RN-058 — Sincronização com Google Calendar
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-022
- **Descrição:** WF-09 — o nutricionista conecta sua conta Google e as consultas aparecem no calendário dele (sentido único).
- **Tarefas técnicas:**
  - [ ] OAuth Google com escopo `calendar.events` apenas
  - [ ] Guardar refresh token no Supabase Vault; tabela `calendar_connections`
  - [ ] Trigger + `pg_net` → Edge Function `calendar-sync`
  - [ ] Título sem dados clínicos; descrição só com link para o painel
  - [ ] Desconectar revoga token e remove eventos futuros (opcional, perguntar)
- **Arquivos/áreas:** `supabase/functions/calendar-sync/`, `apps/web/app/app/settings/integrations/google-calendar/`
- **Critérios de aceite:**
  - Dado conta conectada, quando crio uma consulta, então o evento aparece no Google em até 1 min.
  - Dado consulta remarcada ou cancelada, quando salvo, então o evento é atualizado ou removido.
  - Dado token revogado no Google, quando a sync falha, então a conexão fica inativa e o painel avisa.
- **Testes:** integração com mock da API Google; unidade do mapeamento consulta → evento.

### RN-059 — Preferências de comunicação e opt-out (LGPD)
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-021
- **Descrição:** Registrar consentimento por canal, permitir opt-out pelo link, pela resposta "SAIR" e pelo painel, e respeitar isso em todo envio.
- **Tarefas técnicas:**
  - [ ] Tabela `communication_preferences` + RLS (paciente pode atualizar a própria)
  - [ ] Checkbox de opt-in de WhatsApp no consentimento e na anamnese pública
  - [ ] Link "não quero mais receber" em toda mensagem → `/m/[token]?action=opt-out`
  - [ ] WF-06 (resposta "SAIR")
  - [ ] Normalização de telefone para E.164 (`libphonenumber-js`)
- **Arquivos/áreas:** `supabase/migrations/`, `apps/web/app/m/[token]/`, `n8n/workflows/inbound-opt-out.json`
- **Critérios de aceite:**
  - Dado paciente sem opt-in de WhatsApp, quando qualquer workflow roda, então nenhuma mensagem de WhatsApp é enviada a ele.
  - Dado paciente que responde "SAIR", quando processado, então recebe 1 confirmação e nenhuma mensagem posterior.
- **Testes:** pgTAP (`due_messages` exclui opt-out); unidade de normalização de telefone.

### RN-060 — Log de mensagens e painel de entregas
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-050
- **Descrição:** Registrar toda mensagem (sem guardar o texto completo) e mostrar status de entrega no painel e na ficha do paciente.
- **Tarefas técnicas:**
  - [ ] Tabela `message_logs` + índices + RLS
  - [ ] Edge Function `message-callback` e WF-05
  - [ ] Tela `/app/messages` com filtros (tipo, canal, status, período) e aba na ficha do paciente
  - [ ] Botão "reenviar" para `failed` (nova `idempotency_key` com sufixo `:retry:n`)
  - [ ] Retenção: apagar `message_logs` com mais de 2 anos (pg_cron)
- **Arquivos/áreas:** `supabase/functions/message-callback/`, `apps/web/app/app/messages/`
- **Critérios de aceite:**
  - Dado uma mensagem entregue, quando o provedor envia o status `delivered`, então o painel mostra entregue.
  - Dado um status `delivered` chegando depois de `read`, quando processado, então o status continua `read`.
- **Testes:** unidade da máquina de status; integração do callback.

### RN-061 — Bloqueio por inadimplência e régua de cobrança
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-057, RN-062
- **Descrição:** WF-08 — avisos progressivos e suspensão em modo somente leitura, sem impedir acesso a dados (LGPD e ética profissional).
- **Tarefas técnicas:**
  - [ ] Função `org_is_writable(org)` e inclusão nas políticas de escrita das tabelas clínicas e financeiras
  - [ ] Job diário com etapas 3/7/10/60 dias
  - [ ] Banner no painel para `past_due`; página `/app/blocked` para `suspended` com link de pagamento
  - [ ] Exportação de dados sempre disponível
  - [ ] Reativação automática ao receber pagamento
  - [ ] Pausar automações de mensagens de organizações suspensas
- **Arquivos/áreas:** `supabase/migrations/*_billing_enforcement.sql`, `apps/web/middleware.ts`, `apps/web/app/app/blocked/`
- **Critérios de aceite:**
  - Dado organização `past_due` há 10 dias, quando o job roda, então fica `suspended` e qualquer insert em `meal_plans` é negado pelo banco.
  - Dado organização suspensa, quando o owner exporta dados de um paciente, então a exportação funciona.
  - Dado pagamento confirmado, quando o webhook chega, então a escrita é liberada imediatamente.
- **Testes:** RLS com organização suspensa; pgTAP do job; e2e do fluxo de bloqueio e reativação.

### RN-062 — Webhooks do gateway com idempotência
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-057 (pode ser desenvolvido em paralelo)
- **Descrição:** WF-07 — receber eventos do Asaas com validação, deduplicação e reprocessamento.
- **Tarefas técnicas:**
  - [ ] Route Handler `/api/webhooks/billing` com validação do token do Asaas
  - [ ] Tabela `billing_events` com `unique (provider, provider_event_id)`
  - [ ] Máquina de estados de `subscriptions` em `packages/billing/state-machine.ts`
  - [ ] Job de reprocessamento de eventos não processados
- **Arquivos/áreas:** `apps/web/app/api/webhooks/billing/route.ts`, `packages/billing/`
- **Critérios de aceite:**
  - Dado o mesmo evento recebido 3 vezes, quando processado, então a assinatura muda uma única vez.
  - Dado token inválido, quando o webhook é chamado, então responde 401 e nada é gravado.
- **Testes:** unidade da máquina de estados (todas as transições); integração com payloads reais do sandbox.

### RN-063 — Modelos de mensagem e aprovação de templates WhatsApp
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-050
- **Descrição:** Templates padrão da plataforma (aprovados na Meta) e personalização limitada por organização.
- **Tarefas técnicas:**
  - [ ] Redigir e submeter templates *utility*: lembrete 24h, lembrete 2h, retorno, anamnese, recibo
  - [ ] Tabela `message_templates` e renderizador de variáveis com whitelist
  - [ ] Tela de pré-visualização em `/app/settings/messages`
  - [ ] E-mails em React Email com a marca do profissional
- **Arquivos/áreas:** `packages/messaging/templates/`, `apps/web/app/app/settings/messages/`
- **Critérios de aceite:**
  - Dado um template com variável desconhecida, quando salvo, então é rejeitado.
  - Dado o template de lembrete, quando renderizado, então não contém informação clínica.
- **Testes:** unidade do renderizador; snapshot dos e-mails.

### RN-064 — Painel financeiro e indicadores do consultório
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-053, RN-054, RN-056
- **Descrição:** Dashboard inicial do consultório: faturamento do mês, a receber, ticket médio, consultas realizadas, taxa de faltas, novos pacientes, retornos atrasados.
- **Tarefas técnicas:**
  - [ ] Views/funções SQL agregadas com `security_invoker`
  - [ ] Cards e gráficos (Recharts) na home `/app`
  - [ ] Filtro por nutricionista em organizações `clinic`
- **Arquivos/áreas:** `supabase/migrations/*_dashboard_views.sql`, `apps/web/app/app/page.tsx`
- **Critérios de aceite:**
  - Dado dados de seed conhecidos, quando abro o painel, então cada indicador bate com o cálculo esperado.
- **Testes:** pgTAP das views; e2e com seed.

### RN-065 — Configurações de automação por organização
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-051
- **Descrição:** Tela para ligar/desligar lembretes, definir antecedência, horário de silêncio e envio automático de anamnese.
- **Tarefas técnicas:**
  - [ ] Tabela `automation_settings` criada por trigger junto com a organização
  - [ ] Formulário com validação Zod (antecedências entre 1 e 72h, no máximo 3)
  - [ ] Bloquear opções de WhatsApp quando o plano não inclui
- **Arquivos/áreas:** `apps/web/app/app/settings/automations/`
- **Critérios de aceite:**
  - Dado lembretes desligados, quando o cron roda, então nenhuma mensagem dessa organização é enviada.
- **Testes:** unidade da validação; pgTAP de `due_messages` respeitando settings.

### RN-066 — Operação do n8n: monitoramento, backup e runbook
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-050
- **Descrição:** Garantir que falhas silenciosas de automação sejam detectadas.
- **Tarefas técnicas:**
  - [ ] Healthcheck externo (UptimeRobot/Better Stack) no n8n
  - [ ] Alerta se `message_logs` com `queued` há mais de 30 min > 0
  - [ ] Backup diário do Postgres do n8n e teste de restauração
  - [ ] Runbook: reiniciar, reprocessar fila, trocar credencial do provedor
- **Arquivos/áreas:** `docs/runbooks/n8n.md`, `n8n/`
- **Critérios de aceite:**
  - Dado o n8n parado, quando passa 5 min, então o alerta é disparado.
- **Testes:** simulação de falha em staging.

### RN-067 — Documentação da fase e atualização de termos
- **Tipo:** doc
- **Pontos:** 1
- **Depende de:** RN-057, RN-059
- **Descrição:** Atualizar Termos de Uso, Política de Privacidade (suboperadores: Asaas, provedor WhatsApp, e-mail) e documentação técnica.
- **Tarefas técnicas:**
  - [ ] Lista de suboperadores na Política de Privacidade
  - [ ] ADRs: provedor WhatsApp, gateway de pagamento
  - [ ] Atualizar `docs/03-arquitetura.md` e `docs/04-modelo-dados.md`
- **Arquivos/áreas:** `docs/`
- **Critérios de aceite:**
  - Dado a fase concluída, quando um dev novo lê a documentação, então consegue rodar os workflows em staging.
- **Testes:** —

## Sequência semanal

| Semana | Itens |
|---|---|
| 1 | RN-050, RN-060, RN-059, RN-063 (submeter templates cedo — aprovação da Meta leva dias), RN-053 |
| 2 | RN-051, RN-065, RN-054, RN-055, RN-062 |
| 3 | RN-057, RN-052, RN-056 |
| 4 | RN-061, RN-058, RN-064, RN-066, RN-067, testes e2e e ajustes |

## Critério de pronto da fase

- Uma organização nova entra em trial, assina pelo checkout (sandbox e depois produção) e tem a assinatura renovada e suspensa automaticamente conforme os webhooks.
- Lembretes de consulta, retorno e anamnese chegam sem ação manual, sem duplicidade e respeitando opt-out e horário de silêncio.
- O nutricionista vê faturamento do mês, a receber, pacotes e retornos atrasados.
- Todas as tabelas novas têm RLS e testes de isolamento passando no CI.
- Termos e Política de Privacidade atualizados com os suboperadores.

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Demora na aprovação de templates WhatsApp | Atrasa lembretes | Submeter na semana 1; e-mail como fallback |
| Bloqueio do número por envio indevido | Alto | Só API oficial; opt-in explícito; templates *utility*; volume gradual |
| Mensagem duplicada ou em horário inadequado | Irrita o paciente | `idempotency_key` única, horário de silêncio, testes pgTAP |
| Webhook de pagamento perdido | Cliente pago bloqueado | Reprocessamento, consulta periódica ao Asaas, bloqueio só após 10 dias |
| Bloquear acesso a prontuário por inadimplência | Ético/legal | Suspensão é somente leitura; exportação sempre liberada |
| n8n como ponto único de falha | Médio | Monitoramento, alerta de fila parada, regras no banco (n8n é só executor) |
| Dado clínico vazando para Google Calendar/WhatsApp | Alto | Templates sem dados clínicos; título de evento genérico; revisão no RN-063 |

## Métricas a acompanhar

| Métrica | Meta inicial |
|---|---|
| Taxa de entrega de lembretes (delivered/sent) | > 95% |
| Taxa de faltas (no-show) antes × depois dos lembretes | redução de 30% |
| % de consultas confirmadas pelo paciente | > 50% |
| % de anamneses respondidas antes da 1ª consulta | > 60% |
| Conversão trial → pago | > 20% |
| Churn involuntário (falha de pagamento) | < 1% ao mês |
| Opt-out de WhatsApp | < 3% dos pacientes |
| Custo de mensageria por organização/mês | acompanhar vs. preço do plano |
