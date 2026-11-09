# Fase 5 — UAN e Gestão de Qualidade (Enterprise)

## Objetivo

Entregar a versão **Enterprise** da Rafanutri para empresas de alimentação: restaurantes industriais, cozinhas hospitalares, escolas, hotéis e catering. O objetivo é que uma unidade produtora opere sem planilha e sem papel: ficha técnica, cardápio, compras, estoque, checklists de Boas Práticas, temperatura, não conformidades e documentação para a fiscalização sanitária.

Duração estimada: **10 semanas** (2 devs). Marco: **um cliente piloto** operando uma unidade inteira.

## Escopo / Fora de escopo

**Escopo**
- Unidades produtoras e papéis Enterprise (nutricionista RT, cozinheiro, estoquista, auditor).
- Insumos, unidades de medida, conversões, fornecedores e histórico de preços.
- Ficha Técnica de Preparação (FTP) com peso bruto, peso líquido, fator de correção, índice de cocção, rendimento, custo e informação nutricional, com versão.
- Cardápio cíclico com comensais por dia e turno, per capita, custo e análise nutricional.
- Cálculo de necessidade de compras, pedido de compra e recebimento de mercadorias.
- Estoque por lote e validade, com saída FEFO e inventário.
- Checklists configuráveis no celular, com foto, assinatura, geolocalização e modo offline.
- Equipamentos e registro de temperatura com limites e alertas.
- Não conformidades e plano de ação 5W2H.
- POPs e Manual de Boas Práticas (RDC 216/2004) com versão e aprovação, e registro de treinamentos.
- APPCC: fluxograma, análise de perigos, PCC, limites críticos, monitoramento.
- Rotulagem nutricional (RDC 429/2020 e IN 75/2020).
- Painel de conformidade, relatórios para fiscalização e trilha de auditoria.
- Contrato e planos Enterprise por unidade.

**Fora de escopo**
- Integração com ERP e emissão fiscal (NF-e de entrada). Avaliar por demanda do cliente.
- Integração com sensores IoT de temperatura (fica preparada via API, sem hardware nesta fase).
- Controle de ponto e escalas de funcionários.
- PDV e venda de refeições.

## Pré-requisitos

| Item | Por quê |
|---|---|
| RN-004, RN-007, RN-008, RN-009 | Organizações, papéis, RLS e auditoria |
| RN-010, RN-011, RN-012 | Base de alimentos para a informação nutricional |
| RN-014 | CI |
| RN-036 | Gerador de PDF com marca |
| RN-050 | n8n para alertas |
| RN-057 | Planos, cobrança e feature flags do SaaS |
| RN-070, RN-074 | PWA e notificações push, usados nos checklists móveis |

## Modelo de dados

```sql
-- Estrutura Enterprise
create table production_units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name            text not null,
  kind            text not null check (kind in ('industrial','hospital','school','hotel','restaurant','catering','other')),
  cnpj            text,
  address         jsonb,
  geo_lat         numeric(9,6), geo_lng numeric(9,6), geo_radius_m integer default 200,
  sanitary_license text, sanitary_license_expires_at date,
  technical_lead_id uuid references profiles(id),       -- nutricionista RT
  active          boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table unit_members (
  unit_id    uuid not null references production_units(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  role       text not null check (role in ('technical_lead','cook','stock_keeper','auditor','manager')),
  primary key (unit_id, profile_id, role)
);

create table organization_contracts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  plan            text not null check (plan in ('enterprise_basic','enterprise_pro')),
  units_contracted integer not null,
  monthly_price_cents integer not null,
  starts_at date not null, ends_at date,
  features        jsonb not null default '{}'   -- {"haccp": true, "labeling": false}
);

-- Insumos e compras
create table measurement_units (
  code text primary key,           -- 'g','kg','ml','l','un','cx','dz'
  kind text not null check (kind in ('mass','volume','count'))
);

create table ingredients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name            text not null,
  category        text,                         -- hortifruti, carnes, secos...
  food_id         uuid references foods(id),    -- vínculo para nutrientes
  default_correction_factor numeric(6,3) not null default 1.0,
  purchase_unit   text not null references measurement_units(code),
  purchase_unit_grams numeric(10,3),            -- 1 cx = 12000 g
  density_g_ml    numeric(6,3),
  storage_type    text check (storage_type in ('ambient','chilled','frozen')),
  min_stock_g     numeric(12,3) default 0,
  allergens       text[] not null default '{}',
  active          boolean not null default true
);
create index on ingredients (organization_id, name);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null, cnpj text, contact jsonb,
  rating numeric(3,2), active boolean default true
);

create table ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  ingredient_id uuid not null references ingredients(id),
  supplier_id   uuid references suppliers(id),
  price_cents   integer not null,                -- por purchase_unit
  valid_from    date not null
);
create index on ingredient_prices (ingredient_id, valid_from desc);

-- Ficha técnica
create table recipes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id),
  code             text,
  name             text not null,
  category         text,                       -- prato principal, guarnição...
  version          integer not null default 1,
  status           text not null default 'draft' check (status in ('draft','approved','archived')),
  servings         integer not null,
  serving_size_g   numeric(8,2) not null,
  cooking_index    numeric(6,3),               -- IC calculado ou informado
  cooked_weight_g  numeric(10,2),
  prep_time_min    integer,
  equipment        text[],
  approved_by      uuid references profiles(id), approved_at timestamptz,
  parent_recipe_id uuid references recipes(id),  -- versão anterior
  photo_path       text,
  computed         jsonb not null default '{}'   -- custo, nutrientes por porção e por 100 g
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid references ingredients(id),
  sub_recipe_id uuid references recipes(id),     -- preparações base (molhos, caldos)
  gross_weight_g numeric(10,2) not null,         -- PB
  correction_factor numeric(6,3) not null,       -- FC
  net_weight_g numeric(10,2) not null,           -- PL = PB / FC
  position smallint not null,
  check (ingredient_id is not null or sub_recipe_id is not null)
);

create table recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  position smallint not null, instruction text not null,
  critical_control boolean default false, target_temp_c numeric(5,1)
);

-- Cardápio
create table menu_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  name text not null, length_days smallint not null,   -- ex.: 28
  starts_on date not null, status text default 'draft'
);
create table menu_days (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references menu_cycles(id) on delete cascade,
  day_index smallint not null, service text not null,  -- 'breakfast','lunch','dinner','supper'
  unique (cycle_id, day_index, service)
);
create table menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_day_id uuid not null references menu_days(id) on delete cascade,
  slot text not null,                        -- 'main','side','salad','dessert','drink'
  recipe_id uuid not null references recipes(id),
  per_capita_g numeric(8,2) not null,
  adherence_pct numeric(5,2) not null default 100  -- % de comensais que escolhem a opção
);
create table diner_counts (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references production_units(id),
  service_date date not null, service text not null,
  planned integer not null, actual integer,
  unique (unit_id, service_date, service)
);

-- Compras, recebimento e estoque
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  supplier_id uuid references suppliers(id),
  status text not null default 'draft' check (status in ('draft','sent','partially_received','received','cancelled')),
  period_start date, period_end date, expected_delivery date,
  total_cents integer
);
create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  quantity_purchase_units numeric(12,3) not null,
  unit_price_cents integer, received_quantity numeric(12,3)
);
create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  purchase_order_id uuid references purchase_orders(id),
  received_by uuid not null references profiles(id),
  received_at timestamptz not null default now(),
  checklist_run_id uuid,                         -- checklist de recebimento
  status text not null check (status in ('accepted','partially_rejected','rejected'))
);
create table stock_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  ingredient_id uuid not null references ingredients(id),
  goods_receipt_id uuid references goods_receipts(id),
  lot_code text, expires_on date,
  quantity_g numeric(12,3) not null check (quantity_g >= 0),
  unit_cost_cents_per_kg integer
);
create index on stock_lots (unit_id, ingredient_id, expires_on);
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  lot_id uuid not null references stock_lots(id),
  kind text not null check (kind in ('in','out_production','out_loss','adjustment','transfer')),
  quantity_g numeric(12,3) not null,
  reason text, reference jsonb, created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Checklists e temperatura
create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),  -- null = biblioteca padrão
  name text not null, category text not null,          -- recebimento, higiene, abertura...
  version integer not null default 1,
  schedule jsonb,                                       -- {"rrule":"FREQ=DAILY;BYHOUR=7"}
  requires_signature boolean default true,
  requires_geolocation boolean default false,
  legal_reference text
);
create table checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  position smallint not null, question text not null,
  answer_type text not null check (answer_type in ('yes_no_na','number','temperature','text','photo','select')),
  options jsonb, min_value numeric, max_value numeric,
  requires_photo_on_fail boolean default true,
  critical boolean default false
);
create table checklist_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  template_id uuid not null references checklist_templates(id),
  template_version integer not null,
  due_at timestamptz, started_at timestamptz, completed_at timestamptz,
  executed_by uuid references profiles(id),
  signature_path text, geo_lat numeric(9,6), geo_lng numeric(9,6),
  client_id text unique,                 -- id gerado offline para idempotência
  score_pct numeric(5,2),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','overdue'))
);
create table checklist_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references checklist_runs(id) on delete cascade,
  item_id uuid not null references checklist_template_items(id),
  value jsonb not null, conforming boolean,
  photo_paths text[] default '{}', comment text,
  answered_at timestamptz not null
);
create table equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  name text not null,
  kind text not null check (kind in ('refrigerator','freezer','hot_holding','cold_holding','oven','blast_chiller','other')),
  min_temp_c numeric(5,1), max_temp_c numeric(5,1),
  reading_frequency_hours smallint default 4,
  qr_code text unique, active boolean default true
);
create table temperature_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  equipment_id uuid references equipment(id),
  food_description text,                              -- leitura de alimento (cocção, distribuição)
  reading_c numeric(5,1) not null,
  read_at timestamptz not null, read_by uuid references profiles(id),
  source text not null default 'manual' check (source in ('manual','sensor')),
  within_limits boolean not null,
  corrective_action text
);
create index on temperature_readings (equipment_id, read_at desc);

-- Não conformidades
create table non_conformities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  origin text not null check (origin in ('checklist','temperature','receipt','audit','complaint','other')),
  origin_ref uuid,
  title text not null, description text,
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','action_planned','in_progress','verified','closed')),
  opened_by uuid references profiles(id), opened_at timestamptz default now(),
  closed_at timestamptz, evidence_paths text[] default '{}'
);
create table action_plans (
  id uuid primary key default gen_random_uuid(),
  non_conformity_id uuid not null references non_conformities(id) on delete cascade,
  what text not null, why text not null, where_ text not null, when_due date not null,
  who_id uuid not null references profiles(id), how text not null, how_much_cents integer,
  status text not null default 'todo' check (status in ('todo','doing','done','verified')),
  verified_by uuid references profiles(id), verified_at timestamptz
);

-- Documentos e treinamentos
create table quality_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid references production_units(id),
  kind text not null check (kind in ('good_practices_manual','sop','haccp_plan','policy','other')),
  sop_type text check (sop_type in ('facilities_hygiene','pest_control','water_tank_hygiene','handler_health','other')),
  title text not null, current_version integer not null default 1,
  review_due_on date
);
create table quality_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references quality_documents(id) on delete cascade,
  version integer not null, body_md text not null, pdf_path text,
  status text not null check (status in ('draft','in_review','approved','superseded')),
  authored_by uuid references profiles(id), approved_by uuid references profiles(id),
  approved_at timestamptz, change_summary text,
  unique (document_id, version)
);
create table document_acknowledgements (
  version_id uuid not null references quality_document_versions(id),
  profile_id uuid not null references profiles(id),
  acknowledged_at timestamptz not null default now(),
  primary key (version_id, profile_id)
);
create table trainings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid references production_units(id),
  topic text not null, held_on date not null, hours numeric(4,1) not null,
  instructor text, attendance_list_path text
);
create table training_attendees (
  training_id uuid not null references trainings(id) on delete cascade,
  person_name text not null, profile_id uuid references profiles(id),
  primary key (training_id, person_name)
);

-- APPCC
create table haccp_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  unit_id uuid not null references production_units(id),
  recipe_id uuid references recipes(id), process_name text not null,
  flow_diagram jsonb not null default '{}', status text default 'draft'
);
create table haccp_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references haccp_plans(id) on delete cascade,
  position smallint not null, name text not null,
  hazards jsonb not null default '[]',      -- [{type:'biological', description, severity, likelihood}]
  decision_tree jsonb, is_ccp boolean not null default false,
  critical_limit text, monitoring text, corrective_action text,
  verification text, records text
);

-- Rotulagem
create table nutrition_labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  recipe_id uuid not null references recipes(id),
  recipe_version integer not null,
  physical_state text not null check (physical_state in ('solid','liquid')),
  portion_g_ml numeric(8,2) not null, household_measure text not null,
  values_per_100 jsonb not null, values_per_portion jsonb not null,
  front_warnings text[] not null default '{}',   -- 'added_sugars','saturated_fat','sodium'
  allergen_statement text, image_path text,
  generated_at timestamptz default now()
);
```

**RLS principais**
- Funções `has_unit_role(unit_id uuid, roles text[])` e `org_has_feature(org_id uuid, feature text)`, ambas `security definer`.
- Toda tabela Enterprise exige `org_has_feature(organization_id, 'uan')`. Sem contrato ativo, o acesso é só leitura (exportação) por 90 dias.
- `recipes`, `menu_*`, `ingredients`, `suppliers`: escrita para `owner` e `technical_lead`; leitura para todos os membros da unidade.
- `checklist_runs`, `checklist_answers`, `temperature_readings`: `insert` para `cook`, `stock_keeper` e `technical_lead` da unidade; `update` somente enquanto `status <> 'completed'`. Depois de concluído, o registro é imutável (gatilho bloqueia update e delete).
- `stock_*`, `purchase_orders`, `goods_receipts`: escrita para `stock_keeper` e `technical_lead`.
- `quality_document_versions`: `approved` só pode ser definido por `technical_lead`; versões aprovadas são imutáveis.
- `auditor`: somente `select` em toda a unidade, sem dados pessoais de pacientes (não há pacientes neste módulo).
- Buckets de Storage `uan-evidence` e `uan-documents`, privados e com caminho `org_id/unit_id/...`, verificados na política do bucket.

## Regras de cálculo / domínio

### Ficha técnica
Referências: Ornelas, L. H. *Técnica Dietética: seleção e preparo de alimentos*. 8ª ed. Atheneu, 2007. Abreu, E. S.; Spinelli, M. G. N.; Pinto, A. M. S. *Gestão de Unidades de Alimentação e Nutrição: um modo de fazer*. 7ª ed. Metha, 2019 (**A validar** a edição).

```
FC  (fator de correção)   = PB / PL                 → PL = PB / FC
IC  (índice de cocção)    = peso cozido / Σ PL
Rendimento (g)            = Σ PL × IC     (ou peso cozido medido)
Nº de porções             = Rendimento / porção (g)
Custo do ingrediente      = PB (na unidade de compra) × preço da unidade de compra
Custo total               = Σ custo dos ingredientes (+ sub-receitas proporcionalmente)
Custo por porção          = Custo total / nº de porções
Nutrientes da preparação  = Σ (PL_i / 100 × nutriente_i por 100 g do alimento cru)
Nutrientes por porção     = Nutrientes da preparação × (porção / Rendimento)
```

- Os nutrientes partem do alimento cru (PL). Quando a base tiver o alimento cozido equivalente, a escolha fica para a nutricionista, com aviso. Fatores de retenção de nutrientes na cocção (USDA *Table of Nutrient Retention Factors*, Release 6, 2007) ficam como melhoria futura (**A validar**).
- O FC padrão vem do cadastro do insumo e pode ser sobrescrito na ficha. A tabela inicial de FC de referência da literatura fica como seed **A validar**.
- Sub-receitas entram pelo peso usado e herdam custo e nutrientes por grama.

### Cardápio e necessidade de compras
```
Necessidade líquida do ingrediente (g) =
  Σ (dias e serviços do período) [ comensais_planejados × adesão% × per_capita_preparação_g
                                    × (PL_ingrediente / rendimento_preparação) ]
Necessidade bruta (g)  = Necessidade líquida × FC
Necessidade de compra  = max(0, Necessidade bruta + estoque de segurança − estoque disponível − pedidos em aberto)
Quantidade a pedir     = arredondar para cima (Necessidade de compra / gramas da unidade de compra)
```
- Estoque disponível considera só lotes com validade posterior à data de uso prevista.
- Margem de sobra técnica configurável por unidade (padrão 5%, **A validar** com o cliente piloto).
- Análise nutricional do cardápio por dia e média do ciclo. Metas configuráveis por perfil de comensal; modelos para o PAT (Portaria MTE nº 66/2006, **A validar** a norma vigente) e PNAE (Resolução CD/FNDE nº 06/2020, **A validar**).

### Estoque FEFO
Saída automática pelo lote com validade mais próxima (*first expired, first out*); em empate, o lote mais antigo. Lote vencido fica bloqueado para saída de produção e gera sugestão de baixa por perda.

### Temperaturas de referência (RDC 216/2004)
Referência: ANVISA. Resolução RDC nº 216, de 15 de setembro de 2004, itens 4.8 e 4.10. Os limites ficam como padrão editável por equipamento.

| Situação | Limite |
|---|---|
| Cocção | Centro geométrico a 70 °C, ou combinação tempo × temperatura equivalente |
| Óleos e gorduras de fritura | Não ultrapassar 180 °C |
| Alimento preparado mantido quente | Acima de 60 °C por no máximo 6 horas |
| Resfriamento | De 60 °C a 10 °C em até 2 horas |
| Conservação refrigerada | Abaixo de 5 °C, ou conforme o rótulo do fabricante |
| Conservação congelada | −18 °C ou menos |
| Descongelamento | Sob refrigeração abaixo de 5 °C ou em micro-ondas para cocção imediata |
| Prazo do alimento preparado refrigerado (abaixo de 4 °C) | Até 5 dias |

Legislações estaduais e municipais (ex.: Portaria CVS 5/2013 em São Paulo) podem ser mais restritivas. A biblioteca de limites por estado fica **A validar** com os clientes piloto.

### Checklists
- Pontuação: `score_pct = itens conformes / (itens aplicáveis) × 100`; respostas "N/A" saem do denominador.
- Item `critical` não conforme abre uma não conformidade automaticamente.
- Checklist vence (`overdue`) quando passa de `due_at` mais a tolerância configurada (padrão 1 hora).
- Geolocalização: aviso quando a execução ocorre fora de `geo_radius_m` da unidade (não bloqueia).
- Biblioteca padrão baseada na RDC 216/2004 e na lista de verificação da RDC 275/2002 (Anexo II), com a referência legal em cada modelo.

### Não conformidades e 5W2H
- 5W2H: What, Why, Where, When, Who, How, How much.
- Fluxo: `open → action_planned → in_progress → verified → closed`. Fechar exige verificação de eficácia por `technical_lead` e evidência.
- Prazo padrão por severidade: crítica 24 h, alta 3 dias, média 7 dias, baixa 15 dias (configurável).

### POPs e Manual de Boas Práticas
RDC 216/2004, item 4.11: o serviço deve ter Manual de Boas Práticas e quatro POPs:
1. Higienização de instalações, equipamentos e móveis.
2. Controle integrado de vetores e pragas urbanas.
3. Higienização do reservatório de água.
4. Higiene e saúde dos manipuladores.

Os documentos devem estar acessíveis aos funcionários e à autoridade sanitária, com assinatura do responsável. Versões aprovadas são imutáveis, e cada nova versão pede ciência dos colaboradores da unidade. O responsável pelas atividades de manipulação deve ter capacitação em contaminantes, doenças transmitidas por alimentos, manipulação higiênica e Boas Práticas (item 4.12).

### APPCC
Referência: Codex Alimentarius. *General Principles of Food Hygiene* (CXC 1-1969, revisão 2020). Os 7 princípios: análise de perigos, determinação dos PCC (árvore decisória), limites críticos, monitoramento, ações corretivas, verificação e registros. Severidade × probabilidade em escala 1–3 para priorizar perigos.

### Rotulagem nutricional
Referências: ANVISA RDC nº 429/2020 e IN nº 75/2020. Todos os valores abaixo estão **A validar** contra os anexos da IN 75.

- Tabela por 100 g ou 100 ml, por porção e %VD da porção.
- Nutrientes obrigatórios: valor energético, carboidratos, açúcares totais, açúcares adicionados, proteínas, gorduras totais, gorduras saturadas, gorduras trans, fibra alimentar e sódio.
- Valores de referência para %VD: energia 2000 kcal; carboidratos 300 g; açúcares adicionados 50 g; proteínas 50 g; gorduras totais 65 g; saturadas 20 g; fibras 25 g; sódio 2000 mg.
- Energia: carboidratos 4 kcal/g, proteínas 4 kcal/g, gorduras 9 kcal/g, álcool 7 kcal/g, polióis 2,4 kcal/g, fibras 2 kcal/g.
- Rotulagem nutricional frontal ("lupa"), por 100 g ou 100 ml:

| Nutriente | Sólidos e semissólidos | Líquidos |
|---|---|---|
| Açúcares adicionados | ≥ 15 g | ≥ 7,5 g |
| Gorduras saturadas | ≥ 6 g | ≥ 3 g |
| Sódio | ≥ 600 mg | ≥ 300 mg |

- Regras de arredondamento, valores não significativos e tamanho de porção pelo Anexo V da IN 75 ficam como tabela no `nutrition-core` (**A validar**).
- Declaração de alergênicos: RDC nº 26/2015 (**A validar** a consolidação atual).
- O rótulo gerado é uma ferramenta de apoio. A responsabilidade técnica é da empresa, e a tela deixa isso explícito.

## Rotas e telas

| Rota Next.js | Tela | Papel que acessa |
|---|---|---|
| `/uan` | Seleção de unidade e visão geral | todos os papéis Enterprise |
| `/uan/units` | Gestão de unidades produtoras | owner |
| `/uan/units/[unitId]/members` | Membros e papéis da unidade | owner, technical_lead |
| `/uan/ingredients` | Cadastro de insumos | owner, technical_lead, stock_keeper (leitura) |
| `/uan/suppliers` | Fornecedores e preços | owner, technical_lead, stock_keeper |
| `/uan/recipes` | Lista de fichas técnicas | owner, technical_lead, cook (leitura) |
| `/uan/recipes/[id]` | Editor da ficha técnica | owner, technical_lead |
| `/uan/recipes/[id]/print` | Ficha para a cozinha (impressão/PDF) | todos da unidade |
| `/uan/[unitId]/menus` | Ciclos de cardápio | technical_lead, manager |
| `/uan/[unitId]/menus/[cycleId]` | Editor do cardápio cíclico | technical_lead |
| `/uan/[unitId]/diners` | Comensais planejados e realizados | technical_lead, manager |
| `/uan/[unitId]/purchasing` | Necessidade de compras e pedidos | technical_lead, stock_keeper |
| `/uan/[unitId]/receiving` | Recebimento de mercadorias (mobile) | stock_keeper, technical_lead |
| `/uan/[unitId]/stock` | Estoque, lotes, validade, movimentações | stock_keeper, technical_lead |
| `/uan/[unitId]/stock/inventory` | Inventário | stock_keeper, technical_lead |
| `/uan/[unitId]/checklists` | Agenda de checklists e pendentes | todos da unidade |
| `/uan/[unitId]/checklists/run/[runId]` | Execução do checklist (mobile, offline) | cook, stock_keeper, technical_lead |
| `/uan/checklist-templates` | Biblioteca e editor de modelos | owner, technical_lead |
| `/uan/[unitId]/equipment` | Equipamentos e QR codes | technical_lead |
| `/uan/[unitId]/temperatures` | Registro rápido e histórico de temperaturas | cook, technical_lead, auditor (leitura) |
| `/uan/[unitId]/non-conformities` | Não conformidades e planos 5W2H | technical_lead, manager, auditor (leitura) |
| `/uan/[unitId]/documents` | POPs, Manual de Boas Práticas, versões e ciência | todos (leitura), technical_lead (escrita) |
| `/uan/[unitId]/trainings` | Treinamentos de manipuladores | technical_lead |
| `/uan/[unitId]/haccp` | Planos APPCC | technical_lead, auditor (leitura) |
| `/uan/labels` | Rotulagem nutricional | owner, technical_lead |
| `/uan/[unitId]/compliance` | Painel de conformidade | owner, manager, technical_lead, auditor |
| `/uan/[unitId]/reports` | Relatórios e dossiê para fiscalização | owner, technical_lead, auditor |
| `/settings/billing/enterprise` | Contrato, unidades contratadas e faturas | owner |

## Itens do backlog

### RN-120 — Descoberta com clientes piloto
- **Tipo:** pesquisa
- **Pontos:** 3
- **Depende de:** —
- **Descrição:** Entrevistar 3 empresas de alimentação para validar fluxo, papéis, normas locais e preço.
- **Tarefas técnicas:**
  - [ ] Roteiro de entrevista (rotina, ferramentas atuais, autuações, quem preenche o quê)
  - [ ] Coletar exemplos reais de checklists, fichas técnicas e POPs
  - [ ] Levantar a legislação sanitária estadual e municipal dos pilotos
  - [ ] Avaliar o app **BPF Check** já existente (backend na VPS, ver [ADR 0004](../adr/0004-infraestrutura-hospedagem.md)): modelos de checklist, fluxo mobile, workflow multiagente e usuários atuais; decidir entre integrar, migrar ou reaproveitar partes
  - [ ] Registrar as conclusões em `docs/pesquisa/uan-discovery.md`
- **Arquivos/áreas:** `docs/pesquisa/`
- **Critérios de aceite:** Dadas as entrevistas, quando a fase começar, então há um cliente piloto confirmado e a lista de normas locais aplicáveis.
- **Testes:** não se aplica.

### RN-121 — Migração de unidades e papéis Enterprise
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-008
- **Descrição:** Criar `production_units`, `unit_members` e `organization_contracts`.
- **Tarefas técnicas:**
  - [ ] Migração conforme o esboço
  - [ ] Seed de papéis e de uma unidade de demonstração
  - [ ] Tipos regenerados em `packages/db`
- **Arquivos/áreas:** `supabase/migrations/`, `packages/db`
- **Critérios de aceite:** Dada uma organização, quando criar duas unidades, então cada uma tem membros e papéis independentes.
- **Testes:** integração.

### RN-122 — RLS por unidade e feature flag Enterprise
- **Tipo:** infra
- **Pontos:** 5
- **Depende de:** RN-121
- **Descrição:** Funções `has_unit_role` e `org_has_feature` e políticas base de todas as tabelas UAN.
- **Tarefas técnicas:**
  - [ ] Funções `security definer` com `search_path` fixo
  - [ ] Modelo de política reutilizável documentado em `supabase/README.md`
  - [ ] Checagem no CI: toda tabela do schema público tem RLS habilitada
  - [ ] Testes de isolamento entre unidades e entre organizações
- **Arquivos/áreas:** `supabase/migrations/`, `supabase/tests/`
- **Critérios de aceite:** Dado um cozinheiro da unidade A, quando consultar checklists da unidade B da mesma organização, então recebe zero linhas; dada uma organização sem contrato, quando tentar inserir uma ficha técnica, então recebe erro.
- **Testes:** RLS (pgTAP).

### RN-123 — Tela de unidades e membros
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-122
- **Descrição:** CRUD de unidades, atribuição de RT, convite de membros por papel e geolocalização da unidade.
- **Tarefas técnicas:**
  - [ ] Formulário de unidade com endereço, CNPJ, alvará sanitário e validade
  - [ ] Marcação da posição no mapa (lat/lng e raio)
  - [ ] Convite de membro com papel por unidade
  - [ ] Alerta de alvará vencendo em 30 dias
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/units/`
- **Critérios de aceite:** Dado um owner, quando cria uma unidade e convida um cozinheiro, então o cozinheiro entra e vê só aquela unidade.
- **Testes:** e2e.

### RN-124 — Contrato e planos Enterprise por unidade
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-057, RN-121
- **Descrição:** Planos Enterprise cobrados por unidade, com limite de unidades ativas e recursos por plano.
- **Tarefas técnicas:**
  - [ ] Cadastro de contrato (unidades, preço, vigência, recursos)
  - [ ] Bloqueio ao exceder o nº de unidades contratadas
  - [ ] Cobrança recorrente por fatura (boleto/Pix) no gateway
  - [ ] Tela de faturamento Enterprise
  - [ ] Modo leitura por 90 dias após o fim do contrato
- **Arquivos/áreas:** `apps/web/app/(app)/settings/billing/enterprise/`, `supabase/functions/billing-webhook/`
- **Critérios de aceite:** Dado um contrato de 2 unidades, quando o owner tenta ativar a terceira, então o sistema pede upgrade.
- **Testes:** integração (webhook), e2e.

### RN-125 — Migração de insumos, unidades e fornecedores
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-122
- **Descrição:** Criar `measurement_units`, `ingredients`, `suppliers` e `ingredient_prices`.
- **Tarefas técnicas:**
  - [ ] Migração e RLS
  - [ ] Seed de unidades de medida
  - [ ] `nutrition-core`: conversão entre unidades (massa, volume com densidade, contagem com peso unitário)
- **Arquivos/áreas:** `supabase/migrations/`, `packages/nutrition-core/src/units/`
- **Critérios de aceite:** Dado 1 L de leite com densidade 1,03, quando converter para gramas, então retorna 1030 g.
- **Testes:** unidade, RLS.

### RN-126 — Cadastro de insumos
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-125
- **Descrição:** Insumos vinculados à base de alimentos, com FC padrão, unidade de compra, armazenamento, estoque mínimo e alergênicos.
- **Tarefas técnicas:**
  - [ ] Lista com busca e filtros por categoria
  - [ ] Busca e vínculo com `foods` (TACO/TBCA)
  - [ ] Seed com FC de referência para hortifrútis e carnes (A validar)
  - [ ] Seleção de alergênicos (lista da RDC 26/2015)
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/ingredients/`
- **Critérios de aceite:** Dado um insumo "cebola" vinculado à TACO, quando usado em uma ficha técnica, então traz o FC padrão e os nutrientes.
- **Testes:** e2e.

### RN-127 — Cadastro de fornecedores
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-125
- **Descrição:** Fornecedores com contato, documentos e avaliação.
- **Tarefas técnicas:**
  - [ ] CRUD de fornecedores
  - [ ] Avaliação automática pela taxa de rejeição nos recebimentos (após RN-141)
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/suppliers/`
- **Critérios de aceite:** Dado um fornecedor com 2 recebimentos rejeitados em 10, quando abrir o cadastro, então vê a taxa de rejeição de 20%.
- **Testes:** e2e.

### RN-128 — Histórico de preços de insumos
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-126, RN-127
- **Descrição:** Registrar preços por fornecedor e data, usados no custo das fichas e dos cardápios.
- **Tarefas técnicas:**
  - [ ] Registro manual e atualização a partir do recebimento
  - [ ] Preço vigente = último `valid_from` até a data de referência
  - [ ] Importação de planilha de preços (CSV)
  - [ ] Gráfico de variação de preço
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/suppliers/`, `packages/db`
- **Critérios de aceite:** Dado um novo preço do arroz, quando abrir uma ficha técnica que usa arroz, então o custo é recalculado com o novo preço.
- **Testes:** unidade (preço vigente), integração.

### RN-129 — Migração de fichas técnicas
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-125
- **Descrição:** Criar `recipes`, `recipe_ingredients` e `recipe_steps`.
- **Tarefas técnicas:**
  - [ ] Migração e RLS
  - [ ] Restrição contra ciclo de sub-receitas (gatilho)
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dada a receita A que usa B, quando tentar fazer B usar A, então o banco recusa.
- **Testes:** integração, RLS.

### RN-130 — `nutrition-core`: cálculos da ficha técnica
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-125
- **Descrição:** Funções puras para PL, FC, IC, rendimento, porções, custo e nutrientes, incluindo sub-receitas.
- **Tarefas técnicas:**
  - [ ] `netWeight`, `correctionFactor`, `cookingIndex`, `yieldGrams`, `servings`
  - [ ] `recipeCost(ingredients, prices)` com conversão para a unidade de compra
  - [ ] `recipeNutrients(ingredients, foods)` por preparação, porção e 100 g
  - [ ] Resolução recursiva de sub-receitas com memoização
  - [ ] Casos de teste a partir de fichas da literatura
- **Arquivos/áreas:** `packages/nutrition-core/src/recipes/`
- **Critérios de aceite:** Dado PB = 1000 g e FC = 1,25, quando calcular, então PL = 800 g; dado PL total 800 g e peso cozido 640 g, então IC = 0,80.
- **Testes:** unidade (≥ 95% de cobertura do módulo).

### RN-131 — Editor da ficha técnica
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-126, RN-128, RN-129, RN-130
- **Descrição:** Editor com ingredientes, modo de preparo, equipamentos, foto e cálculos em tempo real.
- **Tarefas técnicas:**
  - [ ] Tabela editável de ingredientes (PB, FC, PL calculado ou PL informado com PB calculado)
  - [ ] Campo de peso cozido ou IC informado
  - [ ] Passos do preparo com marcação de ponto crítico e temperatura alvo
  - [ ] Upload de foto
  - [ ] Painel lateral com rendimento, porções, custo total e por porção, e nutrientes
  - [ ] Escalonamento da receita para N porções
  - [ ] Duplicar ficha
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/recipes/[id]/`, `packages/ui`
- **Critérios de aceite:** Dada uma ficha em rascunho, quando o RT altera o PB de um ingrediente, então custo, rendimento e nutrientes se atualizam sem salvar; ao escalar de 10 para 250 porções, todos os PB são multiplicados por 25.
- **Testes:** e2e, unidade (escalonamento).

### RN-132 — Informação nutricional da ficha técnica
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-131
- **Descrição:** Exibir a composição por porção e por 100 g, com alertas de ingredientes sem vínculo nutricional.
- **Tarefas técnicas:**
  - [ ] Bloco de macro e micronutrientes
  - [ ] Aviso "dados incompletos" com a lista de ingredientes sem `food_id`
  - [ ] Gravação em `recipes.computed` na aprovação
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/recipes/[id]/`
- **Critérios de aceite:** Dada uma ficha com um ingrediente sem vínculo, quando abrir a informação nutricional, então o aviso aparece com o nome do ingrediente.
- **Testes:** e2e.

### RN-133 — PDF da ficha técnica
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-131, RN-036
- **Descrição:** Duas versões: ficha completa (gestão, com custo) e ficha de cozinha (sem custo, fonte grande).
- **Tarefas técnicas:**
  - [ ] Templates de PDF
  - [ ] Opção de esconder custo por papel
- **Arquivos/áreas:** `apps/web/lib/pdf/recipe-sheet.tsx`
- **Critérios de aceite:** Dado um cozinheiro, quando imprime a ficha, então o PDF não mostra custos.
- **Testes:** integração (snapshot).

### RN-134 — Versão e aprovação da ficha técnica
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-131
- **Descrição:** Ficha aprovada é imutável; editar cria nova versão em rascunho.
- **Tarefas técnicas:**
  - [ ] Ação "aprovar" restrita ao RT
  - [ ] "Nova versão" copia a ficha com `parent_recipe_id`
  - [ ] Comparação visual entre versões
  - [ ] Cardápios futuros passam a usar a versão aprovada mais recente
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/recipes/[id]/`, `supabase/migrations/`
- **Critérios de aceite:** Dada uma ficha aprovada, quando um usuário tenta editá-la, então o sistema oferece criar a versão 2, e a versão 1 continua intacta.
- **Testes:** integração, e2e.

### RN-135 — Migração de cardápios e comensais
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-129
- **Descrição:** Criar `menu_cycles`, `menu_days`, `menu_items` e `diner_counts`.
- **Tarefas técnicas:**
  - [ ] Migração e RLS
  - [ ] Visão `menu_calendar` que expande o ciclo em datas reais
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dado um ciclo de 28 dias iniciado em 01/03, quando consultar a visão para 30/03, então retorna o dia 2 do ciclo.
- **Testes:** integração, RLS.

### RN-136 — Editor de cardápio cíclico
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-134, RN-135
- **Descrição:** Calendário por ciclo e serviço, com slots (prato principal, guarnição, salada, sobremesa, bebida) preenchidos com fichas técnicas.
- **Tarefas técnicas:**
  - [ ] Grade de dias × serviços com arrastar e soltar
  - [ ] Busca de fichas aprovadas por categoria
  - [ ] Per capita e adesão por item
  - [ ] Avisos de repetição (mesma preparação em menos de N dias) e de monotonia de cores e métodos de cocção
  - [ ] Duplicar ciclo e publicar para a unidade
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/menus/[cycleId]/`
- **Critérios de aceite:** Dado um ciclo de 4 semanas, quando o RT preenche o almoço e publica, então os cozinheiros veem o cardápio do dia na unidade.
- **Testes:** e2e.

### RN-137 — Comensais e per capita
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-135
- **Descrição:** Planejar e registrar comensais por dia e serviço; comparar planejado e realizado.
- **Tarefas técnicas:**
  - [ ] Grade de comensais planejados, com padrão semanal
  - [ ] Registro do realizado pelo gestor
  - [ ] Indicador de sobra/resto (opcional: peso de resto-ingestão)
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/diners/`
- **Critérios de aceite:** Dado um padrão de 300 almoços de segunda a sexta, quando aplicado ao mês, então todos os dias úteis ficam com 300 planejados.
- **Testes:** e2e.

### RN-138 — Custo e análise nutricional do cardápio
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-132, RN-136, RN-137
- **Descrição:** Custo por refeição e por dia, nutrientes por refeição e média do ciclo contra metas.
- **Tarefas técnicas:**
  - [ ] `menuCost` e `menuNutrients` no `nutrition-core`
  - [ ] Metas configuráveis por perfil de comensal, com modelos PAT e PNAE (A validar)
  - [ ] Painel com custo/refeição e % de adequação
- **Arquivos/áreas:** `packages/nutrition-core/src/menus/`, `apps/web/app/(uan)/uan/[unitId]/menus/`
- **Critérios de aceite:** Dado um cardápio com metas definidas, quando abrir a análise, então vê o custo médio por refeição e os nutrientes fora da meta destacados.
- **Testes:** unidade, e2e.

### RN-139 — Cálculo da necessidade de compras
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-138, RN-143
- **Descrição:** Explodir cardápio × comensais × fichas em necessidade bruta por insumo, descontando estoque e pedidos em aberto.
- **Tarefas técnicas:**
  - [ ] `purchaseRequirements(period, menu, diners, recipes, stock, openOrders)` no `nutrition-core`
  - [ ] Explosão recursiva de sub-receitas
  - [ ] Estoque de segurança e margem por unidade
  - [ ] Arredondamento para a unidade de compra
  - [ ] Tela com a lista por categoria e exportação CSV/PDF
- **Arquivos/áreas:** `packages/nutrition-core/src/purchasing/`, `apps/web/app/(uan)/uan/[unitId]/purchasing/`
- **Critérios de aceite:** Dado 1 dia com 100 comensais, per capita de arroz de 150 g cozido, ficha com IC 2,5 e FC 1,0, quando calcular, então a necessidade de arroz cru é 6 kg (antes de margem e estoque).
- **Testes:** unidade (casos com sub-receita, estoque e pedido em aberto).

### RN-140 — Pedido de compra
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-139
- **Descrição:** Gerar pedidos por fornecedor a partir da necessidade e enviá-los.
- **Tarefas técnicas:**
  - [ ] Migração `purchase_orders` e `purchase_order_items`
  - [ ] Separação automática por fornecedor preferencial
  - [ ] PDF do pedido e envio por e-mail ou WhatsApp via n8n
  - [ ] Status do pedido
- **Arquivos/áreas:** `supabase/migrations/`, `apps/web/app/(uan)/uan/[unitId]/purchasing/`, `n8n/workflows/purchase-order-send.json`
- **Critérios de aceite:** Dada uma necessidade com 3 fornecedores, quando gerar pedidos, então são criados 3 pedidos em rascunho que podem ser enviados.
- **Testes:** integração, e2e.

### RN-141 — Recebimento de mercadorias
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-140, RN-146
- **Descrição:** Conferência no celular com checklist de recebimento (temperatura, embalagem, validade, rotulagem, veículo) e entrada em estoque por lote.
- **Tarefas técnicas:**
  - [ ] Migração `goods_receipts`
  - [ ] Tela mobile: conferir quantidade, lote e validade item a item
  - [ ] Checklist de recebimento padrão com temperatura por tipo (refrigerado, congelado)
  - [ ] Rejeição parcial com foto e motivo, gerando não conformidade
  - [ ] Criação dos lotes em `stock_lots` e movimento `in`
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/receiving/`
- **Critérios de aceite:** Dado um pedido com carne, quando o estoquista registra 9 °C no recebimento, então o item é marcado como não conforme, exige foto e abre uma não conformidade.
- **Testes:** e2e, integração.

### RN-142 — Migração de estoque
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-125
- **Descrição:** Criar `stock_lots` e `stock_movements` com saldo consistente.
- **Tarefas técnicas:**
  - [ ] Migração e RLS
  - [ ] Função `apply_stock_movement` transacional que atualiza o lote e impede saldo negativo
  - [ ] Visão `stock_balance` por unidade e insumo
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dado um lote com 2 kg, quando registrar saída de 3 kg, então a transação falha.
- **Testes:** integração (concorrência com duas saídas simultâneas).

### RN-143 — Estoque com FEFO
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-142
- **Descrição:** Saldo por insumo, lotes e validades, saída por produção com escolha FEFO e baixa por perda.
- **Tarefas técnicas:**
  - [ ] Tela de saldo com lotes e cores por validade
  - [ ] `pickLotsFefo(lots, quantity)` no `nutrition-core`
  - [ ] Saída de produção a partir do cardápio do dia
  - [ ] Baixa por perda com motivo
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/stock/`, `packages/nutrition-core/src/stock/`
- **Critérios de aceite:** Dados dois lotes de leite com validades 10/05 e 05/05, quando registrar saída, então o sistema consome primeiro o de 05/05.
- **Testes:** unidade, e2e.

### RN-144 — Inventário e ajustes
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-143
- **Descrição:** Contagem física, diferença contra o sistema e ajuste com aprovação.
- **Tarefas técnicas:**
  - [ ] Abertura de inventário com lista de insumos
  - [ ] Contagem no celular
  - [ ] Relatório de divergências e aprovação do ajuste pelo RT
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/stock/inventory/`
- **Critérios de aceite:** Dado um inventário com divergência de 2 kg, quando o RT aprova, então é gerado um movimento `adjustment` com o motivo.
- **Testes:** e2e.

### RN-145 — Alertas de validade e estoque mínimo
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-143, RN-050
- **Descrição:** Avisos diários de lotes vencendo e insumos abaixo do mínimo.
- **Tarefas técnicas:**
  - [ ] Job diário (pg_cron ou n8n) que gera a lista
  - [ ] Envio por e-mail ou WhatsApp para o estoquista e o RT
  - [ ] Badge no menu da unidade
- **Arquivos/áreas:** `n8n/workflows/stock-alerts.json`, `supabase/migrations/`
- **Critérios de aceite:** Dado um lote que vence em 2 dias, quando o job roda às 7h, então o estoquista recebe o aviso.
- **Testes:** integração.

### RN-146 — Migração de checklists
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-122
- **Descrição:** Criar `checklist_templates`, `checklist_template_items`, `checklist_runs` e `checklist_answers`, e o bucket de evidências.
- **Tarefas técnicas:**
  - [ ] Migração e RLS
  - [ ] Gatilho que impede alteração de checklist concluído
  - [ ] Bucket `uan-evidence` com política por caminho
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dado um checklist concluído, quando alguém tentar alterar uma resposta, então o banco recusa.
- **Testes:** RLS, integração.

### RN-147 — Editor de modelos e biblioteca padrão
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-146
- **Descrição:** Editor de modelos e biblioteca inicial baseada na RDC 216/2004 e na RDC 275/2002.
- **Tarefas técnicas:**
  - [ ] Editor de itens (tipos de resposta, limites, críticos, foto obrigatória)
  - [ ] Agendamento por regra de recorrência
  - [ ] Biblioteca: abertura da cozinha, higiene de manipuladores, recebimento, higienização de setores, temperatura de equipamentos, controle de pragas, reservatório de água
  - [ ] Copiar modelo da biblioteca para a organização
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/checklist-templates/`, `supabase/seed/checklists/`
- **Critérios de aceite:** Dado o modelo "Higiene dos manipuladores" da biblioteca, quando o RT o copia e agenda para todo dia às 7h, então os checklists diários aparecem na agenda da unidade.
- **Testes:** e2e.

### RN-148 — Execução de checklist no celular
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-147
- **Descrição:** Tela mobile item a item, com foto, assinatura e geolocalização.
- **Tarefas técnicas:**
  - [ ] Interface de um item por vez, botões grandes, funcionamento com luvas em mente
  - [ ] Captura de foto com compressão no cliente (máx. 1600 px)
  - [ ] Assinatura em canvas salva como PNG
  - [ ] Geolocalização com aviso fora do raio
  - [ ] Cálculo da pontuação e abertura automática de não conformidade em item crítico
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/checklists/run/[runId]/`, `packages/ui/src/mobile/`
- **Critérios de aceite:** Dado um cozinheiro no celular, quando responde um item crítico como "não", então o app exige foto e comentário e, ao concluir, uma não conformidade é aberta.
- **Testes:** e2e (viewport mobile).

### RN-149 — Modo offline dos checklists
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-148
- **Descrição:** Executar checklists e registrar temperaturas sem internet, sincronizando depois.
- **Tarefas técnicas:**
  - [ ] Service worker com cache dos modelos e das telas
  - [ ] IndexedDB para respostas, fotos e assinaturas pendentes
  - [ ] Fila de sincronização com `client_id` idempotente e nova tentativa com backoff
  - [ ] Indicador de "pendente de envio"
  - [ ] Política de conflito: o servidor rejeita runs já concluídos por outra pessoa e o app mostra o aviso
- **Arquivos/áreas:** `apps/web/lib/offline/`, `apps/web/public/sw.js`
- **Critérios de aceite:** Dado um celular em modo avião, quando o cozinheiro conclui um checklist com 2 fotos e volta a ficar online, então o checklist aparece no servidor com o horário original e as fotos, sem duplicar.
- **Testes:** e2e (Playwright com `context.setOffline`), unidade (fila).

### RN-150 — Agenda e cobrança de checklists pendentes
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-147, RN-050
- **Descrição:** Gerar as instâncias agendadas e avisar quem está atrasado.
- **Tarefas técnicas:**
  - [ ] Job que cria `checklist_runs` do dia a partir da regra de recorrência
  - [ ] Marcação de `overdue` com tolerância
  - [ ] Push e WhatsApp para o executor e resumo diário para o RT
- **Arquivos/áreas:** `supabase/functions/checklist-scheduler/`, `n8n/workflows/checklist-overdue.json`
- **Critérios de aceite:** Dado um checklist às 7h com tolerância de 1h, quando não for feito até 8h, então fica `overdue` e o RT é avisado.
- **Testes:** integração.

### RN-151 — Equipamentos e registro de temperatura
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-146
- **Descrição:** Cadastro de equipamentos com limites e QR code, e registro rápido de temperatura.
- **Tarefas técnicas:**
  - [ ] Migração `equipment` e `temperature_readings`
  - [ ] Limites padrão por tipo de equipamento (RDC 216/2004)
  - [ ] Etiqueta com QR code que abre o registro direto do equipamento
  - [ ] Registro de temperatura de alimentos (cocção, distribuição, resfriamento)
  - [ ] Ação corretiva obrigatória quando fora do limite
  - [ ] Gráfico histórico por equipamento
  - [ ] Endpoint para leituras de sensor (`source = 'sensor'`), autenticado por chave da unidade
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/equipment/`, `apps/web/app/(uan)/uan/[unitId]/temperatures/`, `supabase/functions/sensor-ingest/`
- **Critérios de aceite:** Dada uma geladeira com limite máximo de 5 °C, quando o cozinheiro lê o QR e registra 7 °C, então o app exige ação corretiva e marca a leitura como fora do limite.
- **Testes:** e2e, integração (endpoint de sensor).

### RN-152 — Alertas de temperatura
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-151, RN-050
- **Descrição:** Avisar imediatamente o RT sobre leituras fora do limite e equipamentos sem leitura no prazo.
- **Tarefas técnicas:**
  - [ ] Webhook do Supabase para o n8n em leitura fora do limite
  - [ ] Mensagem por WhatsApp e push com equipamento, valor e ação registrada
  - [ ] Job de "leitura atrasada" pela frequência do equipamento
  - [ ] Abertura automática de não conformidade após 2 leituras seguidas fora do limite
- **Arquivos/áreas:** `n8n/workflows/temperature-alerts.json`
- **Critérios de aceite:** Dada uma leitura de −10 °C num freezer com limite de −18 °C, quando registrada, então o RT recebe a mensagem em até 1 minuto.
- **Testes:** integração.

### RN-153 — Não conformidades
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-148, RN-151
- **Descrição:** Registro, classificação e acompanhamento de não conformidades de qualquer origem.
- **Tarefas técnicas:**
  - [ ] Migração `non_conformities`
  - [ ] Abertura manual e automática (checklist, temperatura, recebimento)
  - [ ] Quadro por status, filtros por severidade e origem
  - [ ] Prazo por severidade e destaque de atrasadas
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/non-conformities/`
- **Critérios de aceite:** Dada uma não conformidade crítica aberta há 25 horas sem plano, quando o RT abre o quadro, então ela aparece como atrasada.
- **Testes:** e2e, RLS.

### RN-154 — Plano de ação 5W2H
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-153
- **Descrição:** Planos de ação 5W2H por não conformidade, com verificação de eficácia.
- **Tarefas técnicas:**
  - [ ] Migração `action_plans`
  - [ ] Formulário 5W2H e lembretes ao responsável
  - [ ] Verificação pelo RT com evidência para fechar
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/non-conformities/[id]/`, `n8n/workflows/action-plan-reminders.json`
- **Critérios de aceite:** Dada uma não conformidade com plano concluído, quando o RT tenta fechá-la sem evidência, então o sistema exige o anexo.
- **Testes:** e2e.

### RN-155 — Migração de documentos e treinamentos
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-122
- **Descrição:** Criar `quality_documents`, `quality_document_versions`, `document_acknowledgements`, `trainings` e `training_attendees`.
- **Tarefas técnicas:**
  - [ ] Migração e RLS
  - [ ] Gatilho de imutabilidade de versão aprovada
  - [ ] Bucket `uan-documents`
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dada uma versão aprovada, quando alguém tenta alterar o texto, então o banco recusa.
- **Testes:** RLS, integração.

### RN-156 — Modelos dos 4 POPs obrigatórios
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-155
- **Descrição:** Modelos editáveis dos POPs exigidos pela RDC 216/2004, preenchidos com os dados da unidade.
- **Tarefas técnicas:**
  - [ ] Modelos em Markdown com variáveis (`{{unit.name}}`, `{{technical_lead.name}}`, equipamentos, produtos de limpeza)
  - [ ] Editor com pré-visualização
  - [ ] Revisão dos modelos pela nutricionista RT parceira
  - [ ] Vínculo POP → checklists de monitoramento
- **Arquivos/áreas:** `supabase/seed/quality-docs/`, `apps/web/app/(uan)/uan/[unitId]/documents/`
- **Critérios de aceite:** Dada uma unidade com equipamentos cadastrados, quando o RT cria o POP de higienização, então o documento já lista os equipamentos da unidade.
- **Testes:** unidade (substituição de variáveis), e2e.

### RN-157 — Manual de Boas Práticas
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-156
- **Descrição:** Gerar o Manual de Boas Práticas a partir de um modelo e dos dados da unidade, em PDF.
- **Tarefas técnicas:**
  - [ ] Estrutura do manual pelos itens da RDC 216 (edificação, higienização, pragas, água, resíduos, manipuladores, matérias-primas, preparo, armazenamento, transporte, exposição, documentação, responsabilidade)
  - [ ] Anexação dos POPs aprovados
  - [ ] PDF com capa, sumário, versão e assinatura do responsável
- **Arquivos/áreas:** `apps/web/lib/pdf/good-practices-manual.tsx`
- **Critérios de aceite:** Dados os 4 POPs aprovados, quando gerar o manual, então o PDF inclui os POPs como anexos e a versão atual.
- **Testes:** integração (snapshot).

### RN-158 — Aprovação, versão e ciência de documentos
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-155
- **Descrição:** Fluxo rascunho → revisão → aprovado, com data de revisão periódica e ciência dos colaboradores.
- **Tarefas técnicas:**
  - [ ] Ações por papel e histórico de versões com resumo da mudança
  - [ ] Ciência obrigatória ao publicar nova versão, com lista de pendentes
  - [ ] Alerta de revisão vencida
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/documents/`
- **Critérios de aceite:** Dada a versão 3 aprovada de um POP, quando um cozinheiro entra no app, então é solicitado a dar ciência antes de seguir.
- **Testes:** e2e.

### RN-159 — Treinamentos de manipuladores
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-155
- **Descrição:** Registrar capacitações com tema, carga horária, instrutor e participantes.
- **Tarefas técnicas:**
  - [ ] CRUD de treinamentos e lista de presença (upload)
  - [ ] Visão por colaborador e alerta de reciclagem (periodicidade configurável)
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/trainings/`
- **Critérios de aceite:** Dado um colaborador sem treinamento há 12 meses, quando o RT abre a tela, então o colaborador aparece em "reciclagem pendente".
- **Testes:** e2e.

### RN-160 — APPCC: fluxograma e análise de perigos
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-131, RN-155
- **Descrição:** Montar o fluxograma do processo e registrar perigos biológicos, químicos, físicos e alergênicos por etapa.
- **Tarefas técnicas:**
  - [ ] Migração `haccp_plans` e `haccp_steps`
  - [ ] Editor de etapas (lista ordenada com visualização em fluxograma)
  - [ ] Importar etapas a partir dos passos da ficha técnica
  - [ ] Matriz severidade × probabilidade
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/haccp/`, `supabase/migrations/`
- **Critérios de aceite:** Dada a ficha "frango assado", quando o RT cria um plano APPCC a partir dela, então as etapas do preparo viram etapas do fluxograma.
- **Testes:** e2e.

### RN-161 — APPCC: PCC, limites e monitoramento
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-160, RN-151
- **Descrição:** Árvore decisória do Codex para PCC, limites críticos, monitoramento, ação corretiva, verificação e registros.
- **Tarefas técnicas:**
  - [ ] Árvore decisória guiada (4 perguntas do Codex) por perigo
  - [ ] Cadastro de limite crítico e de monitoramento
  - [ ] Geração automática de checklist ou leitura de temperatura para cada PCC
  - [ ] PDF do plano APPCC
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/haccp/[planId]/`
- **Critérios de aceite:** Dada a etapa "cocção" marcada como PCC com limite de 70 °C, quando salvar, então é criado um registro de temperatura obrigatório para essa preparação.
- **Testes:** unidade (árvore decisória), e2e.

### RN-162 — Rotulagem: cálculo da tabela nutricional
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-132
- **Descrição:** Calcular a tabela nutricional por 100 g/ml e por porção, com %VD e arredondamentos da IN 75/2020.
- **Tarefas técnicas:**
  - [ ] Migração `nutrition_labels`
  - [ ] `nutrition-core`: valores de referência, arredondamento e valores não significativos (A validar)
  - [ ] Cadastro de açúcares adicionados por insumo
  - [ ] Seleção de porção e medida caseira
- **Arquivos/áreas:** `packages/nutrition-core/src/labeling/`, `apps/web/app/(uan)/uan/labels/`
- **Critérios de aceite:** Dada uma preparação com 12 g de proteínas por porção, quando gerar a tabela, então o %VD de proteínas é 24%.
- **Testes:** unidade (casos de referência da IN 75).

### RN-163 — Rotulagem: alerta frontal
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-162
- **Descrição:** Determinar a lupa de "alto em" açúcares adicionados, gorduras saturadas e sódio.
- **Tarefas técnicas:**
  - [ ] `frontWarnings(per100, physicalState)` com os limites da IN 75
  - [ ] Exceções previstas na norma (A validar)
- **Arquivos/áreas:** `packages/nutrition-core/src/labeling/front.ts`
- **Critérios de aceite:** Dado um sólido com 700 mg de sódio por 100 g, quando avaliar, então retorna `sodium`.
- **Testes:** unidade (valores no limite exato).

### RN-164 — Rotulagem: geração do rótulo e alergênicos
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-162, RN-163
- **Descrição:** Gerar imagem e PDF da tabela e da lupa no formato da norma, com declaração de alergênicos.
- **Tarefas técnicas:**
  - [ ] Templates SVG nos formatos vertical, horizontal e linear (A validar as dimensões)
  - [ ] Declaração "ALÉRGICOS: CONTÉM ..." a partir dos insumos
  - [ ] Download em PNG, SVG e PDF
  - [ ] Aviso de responsabilidade técnica
- **Arquivos/áreas:** `apps/web/lib/labels/`, `apps/web/app/(uan)/uan/labels/`
- **Critérios de aceite:** Dada uma ficha com leite e trigo, quando gerar o rótulo, então a declaração lista leite e trigo.
- **Testes:** integração (snapshot SVG).

### RN-165 — Painel de conformidade
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-150, RN-152, RN-153, RN-158
- **Descrição:** Visão por unidade e consolidada: checklists em dia, pontuação, temperaturas fora do limite, não conformidades abertas, documentos vencidos e treinamentos pendentes.
- **Tarefas técnicas:**
  - [ ] Visões SQL agregadas (materializadas e atualizadas a cada 15 minutos)
  - [ ] Índice de conformidade da unidade (fórmula documentada e configurável)
  - [ ] Comparativo entre unidades para o owner
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/[unitId]/compliance/`, `supabase/migrations/`
- **Critérios de aceite:** Dadas 3 unidades, quando o owner abre o painel, então vê o índice de cada uma e consegue abrir os itens pendentes.
- **Testes:** integração (visões), e2e.

### RN-166 — Relatórios e dossiê para fiscalização
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-165, RN-157, RN-161
- **Descrição:** Relatórios por período e um dossiê em PDF com o que a vigilância sanitária costuma pedir.
- **Tarefas técnicas:**
  - [ ] Relatórios: planilhas de temperatura, checklists, não conformidades, treinamentos, controle de pragas e reservatório
  - [ ] Dossiê: Manual de Boas Práticas, POPs vigentes, registros dos últimos N dias, alvará e RT
  - [ ] Geração assíncrona (Edge Function) com link de download
  - [ ] Exportação CSV
- **Arquivos/áreas:** `supabase/functions/compliance-dossier/`, `apps/web/app/(uan)/uan/[unitId]/reports/`
- **Critérios de aceite:** Dada uma unidade com 30 dias de registros, quando o RT pede o dossiê, então recebe um PDF único com índice e todos os registros do período.
- **Testes:** integração.

### RN-167 — Trilha de auditoria e integridade dos registros
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-146, RN-151, RN-155
- **Descrição:** Garantir que registros de qualidade não sejam apagados nem alterados sem rastro.
- **Tarefas técnicas:**
  - [ ] Auditoria (RN-009) em todas as tabelas UAN
  - [ ] Hash SHA-256 de cada checklist concluído e de cada versão de documento, guardado no registro
  - [ ] Verificação de integridade no dossiê
  - [ ] Bloqueio de delete físico (somente arquivamento)
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dado um checklist concluído, quando o hash for recalculado, então confere com o gravado; se diferir, o dossiê aponta a divergência.
- **Testes:** integração.

### RN-168 — Testes e2e e piloto
- **Tipo:** doc
- **Pontos:** 5
- **Depende de:** RN-121 a RN-167
- **Descrição:** Suíte e2e do fluxo completo e operação assistida de 2 semanas no cliente piloto.
- **Tarefas técnicas:**
  - [ ] e2e: ficha → cardápio → compras → recebimento → estoque → checklist → não conformidade → dossiê
  - [ ] Teste de carga leve (50 usuários simultâneos executando checklists)
  - [ ] Acompanhamento diário do piloto e registro de problemas
  - [ ] Guia do usuário Enterprise em `docs/guias/`
- **Arquivos/áreas:** `apps/web/e2e/uan/`, `docs/guias/`
- **Critérios de aceite:** Dado o piloto, quando terminar o período assistido, então a unidade operou 10 dias úteis seguidos sem planilha e sem incidente bloqueante aberto.
- **Testes:** e2e, carga.

### RN-169 — Onboarding Enterprise e importação de dados
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-126, RN-131
- **Descrição:** Importar insumos, fornecedores, preços e fichas técnicas de planilhas do cliente.
- **Tarefas técnicas:**
  - [ ] Modelos de planilha para download
  - [ ] Importador CSV/XLSX com validação, pré-visualização e relatório de erros
  - [ ] Vínculo assistido de insumos com a TACO por similaridade de nome
  - [ ] Roteiro de implantação em `docs/guias/implantacao-enterprise.md`
- **Arquivos/áreas:** `apps/web/app/(uan)/uan/import/`, `supabase/functions/import-uan/`
- **Critérios de aceite:** Dada uma planilha com 300 insumos e 10 linhas inválidas, quando importar, então 290 entram e o relatório mostra as 10 linhas com o motivo.
- **Testes:** integração, e2e.

## Sequência semanal

| Semana | Itens |
|---|---|
| 0 (antes) | RN-120 |
| 1 | RN-121, RN-122, RN-123, RN-125 |
| 2 | RN-126, RN-127, RN-128, RN-129, RN-130 |
| 3 | RN-131, RN-132, RN-133, RN-134 |
| 4 | RN-135, RN-136, RN-137, RN-142 |
| 5 | RN-138, RN-143, RN-139, RN-140 |
| 6 | RN-146, RN-147, RN-148, RN-151 |
| 7 | RN-141, RN-149, RN-150, RN-152, RN-144, RN-145 |
| 8 | RN-153, RN-154, RN-155, RN-156, RN-158, RN-159 |
| 9 | RN-157, RN-165, RN-166, RN-167, RN-124, RN-169 |
| 10 | RN-168 (piloto) e, se houver folga, RN-160, RN-161 |
| Pós-fase | RN-160, RN-161, RN-162, RN-163, RN-164 (APPCC e rotulagem, conforme demanda do piloto) |

APPCC e rotulagem são os itens com maior chance de sair da fase sem prejudicar o piloto, porque a RDC 216 não os exige de todo serviço de alimentação.

## Critério de pronto da fase

- O cliente piloto opera uma unidade por 10 dias úteis seguidos: cardápio → compras → recebimento → estoque → checklists diários, sem planilha.
- Checklists funcionam offline e sincronizam sem perda nem duplicação.
- Leitura de temperatura fora do limite chega ao RT em até 1 minuto.
- O dossiê para fiscalização é gerado com Manual de Boas Práticas, POPs e registros do período.
- Testes de RLS provam isolamento entre organizações e entre unidades.
- Cobrança Enterprise por unidade funcionando.
- Itens "A validar" desta fase resolvidos ou registrados com dono e data.

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Uso do celular na cozinha (luvas, umidade, internet ruim) | Adoção baixa | Interface de toque grande, modo offline, QR code nos equipamentos, teste no ambiente real |
| Normas estaduais e municipais diferentes da RDC 216 | Documentos e limites errados | Limites e modelos configuráveis por unidade, levantamento das normas no RN-120 |
| Escopo grande (50 itens) | Atraso do piloto | APPCC e rotulagem como itens que podem sair da fase; foco no fluxo do piloto |
| Cálculo de compras errado | Falta ou desperdício de insumo | Testes com casos reais do piloto, revisão do RT antes de enviar o pedido |
| Registros alterados após o fato | Perda de valor legal | Imutabilidade, hash e auditoria (RN-167) |
| Rótulo nutricional incorreto | Risco regulatório para o cliente | Validação contra a IN 75, aviso de responsabilidade técnica, revisão pelo RT |
| Dependência de uma única nutricionista para validar | Gargalo | Contratar consultoria pontual de especialista em UAN para revisar modelos |

## Métricas a acompanhar

- Unidades Enterprise ativas e MRR Enterprise.
- % de checklists executados no prazo por unidade (meta ≥ 95%).
- Tempo médio entre leitura fora do limite e ação corretiva.
- Não conformidades abertas por unidade e tempo médio de fechamento.
- Diferença entre compra calculada e consumo real (meta: < 5%).
- % de checklists executados offline e taxa de falha de sincronização (meta: 0% de perda).
- Nº de autuações sanitárias dos clientes após a implantação (indicador de valor, coletado em entrevista).
