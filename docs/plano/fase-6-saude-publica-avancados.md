# Fase 6 — Saúde Pública e Recursos Avançados

## Objetivo

Expandir a Rafanutri para a nutrição comunitária e de saúde pública (triagens, programas e indicadores populacionais) e entregar os recursos avançados que aumentam o valor dos planos pagos: assistente RAG, somatotipo, exames, suplementação, conteúdo de marketing, chat, app nativo, interoperabilidade FHIR e cobrança online de pacientes.

Esta fase é **contínua**: os blocos são independentes e entram por ordem de demanda comercial. Cada bloco tem seu próprio critério de pronto.

| Bloco | Itens | Estimativa |
|---|---|---|
| A. Triagens nutricionais | RN-170 a RN-174 | 2 semanas |
| B. Programas e saúde pública | RN-175 a RN-179 | 3 semanas |
| C. Assistente RAG | RN-180 a RN-183 | 3 semanas |
| D. Clínica avançada (somatotipo, exames, suplementos) | RN-184 a RN-188 | 4 semanas |
| E. Marketing e materiais | RN-189, RN-190 | 2 semanas |
| F. Chat | RN-191, RN-192 | 2 semanas |
| G. App nativo | RN-193, RN-194 | 4 semanas |
| H. Interoperabilidade FHIR | RN-195, RN-196 | 3 semanas |
| I. Cobrança de pacientes | RN-197, RN-198 | 2 semanas |
| J. Robustez | RN-199 | 1 semana |

## Escopo / Fora de escopo

**Escopo**
- Triagens NRS-2002, MNA (completa e reduzida), MUST e Avaliação Subjetiva Global (ASG/SGA).
- Programas e grupos populacionais com inscrição, metas e indicadores coletivos.
- Relatórios epidemiológicos por território com anonimização.
- Estudo de exportação para SISVAN/e-SUS.
- Assistente RAG sobre diretrizes e tabelas, com citação de fonte.
- Somatotipo de Heath-Carter e somatocarta.
- Exames laboratoriais com valores de referência e evolução.
- Suplementos e fitoterápicos com alertas de interação droga-nutriente.
- Gerador de conteúdo de marketing com IA e biblioteca de materiais para pacientes.
- Chat entre paciente e nutricionista em tempo real.
- App nativo (Expo) para o paciente.
- Interoperabilidade FHIR R4 (exportação e importação).
- Cobrança online de pacientes (Pix e cartão).
- Endurecimento de performance, observabilidade e carga.

**Fora de escopo**
- Integração em produção com a RNDS (exige credenciamento; aqui só pesquisa e prototipação).
- Telemedicina com vídeo próprio.
- Prescrição de medicamentos (fora da competência do nutricionista).
- Emissão de NFS-e (avaliar provedor depois).
- App nativo para o painel do nutricionista.

## Pré-requisitos

| Item | Por quê |
|---|---|
| RN-008, RN-009 | RLS e auditoria |
| RN-020, RN-023 | Pacientes e prontuário |
| RN-027, RN-028 | Antropometria (dobras e perímetros para somatotipo; IMC e perda de peso para triagens) |
| RN-031 | Plano alimentar (suplementos entram como itens do plano) |
| RN-050, RN-051 | n8n e mensageria |
| RN-053, RN-054, RN-057 | Financeiro, pacotes e gateway de pagamento do SaaS |
| RN-070, RN-071, RN-073, RN-074 | PWA do paciente e push |
| RN-075, RN-077 | Infra de IA, registro de sugestões e limites de uso |
| RN-118 | Responsáveis legais (chat e app com menores) |

## Modelo de dados

```sql
-- A. Triagens
create table nutrition_screenings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id      uuid not null references patients(id) on delete cascade,
  tool            text not null check (tool in ('nrs_2002','mna_full','mna_sf','must','sga')),
  tool_version    text not null,                 -- ex.: 'nrs_2002@kondrup2003'
  answers         jsonb not null,
  score           numeric(5,2),
  classification  text not null,                 -- ex.: 'at_risk', 'malnourished', 'B'
  risk_level      text not null check (risk_level in ('low','medium','high')),
  screened_at     timestamptz not null default now(),
  screened_by     uuid not null references profiles(id),
  program_id      uuid,                          -- quando feita em ação de programa
  notes           text
);
create index on nutrition_screenings (organization_id, tool, screened_at desc);
create index on nutrition_screenings (patient_id, screened_at desc);

-- B. Programas e território
create table territories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,                            -- UBS, bairro, escola
  kind text not null check (kind in ('health_unit','neighborhood','school','company','other')),
  ibge_code text, parent_id uuid references territories(id)
);
alter table patients add column territory_id uuid references territories(id);

create table programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  target_group text not null check (target_group in ('hypertension','diabetes','pregnancy','obesity','elderly','children','other')),
  starts_on date not null, ends_on date,
  goals jsonb not null default '[]',             -- [{indicator:'mean_bmi', target: -1, unit:'kg/m2'}]
  status text not null default 'active'
);
create table program_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  enrolled_at date not null, left_at date, left_reason text,
  baseline jsonb not null default '{}',          -- peso, IMC, PA, HbA1c na entrada
  unique (program_id, patient_id)
);
create table program_activities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  kind text not null check (kind in ('group_session','screening_campaign','workshop','home_visit')),
  held_at timestamptz not null, topic text, attendees uuid[] not null default '{}'
);
create materialized view program_indicators as
  select ... ;  -- agregados por programa e mês (ver RN-177)

-- C. RAG
create extension if not exists vector;
create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),   -- null = base curada da plataforma
  title text not null, source_url text, publisher text,
  published_on date, license text not null,
  storage_path text, checksum text not null,
  status text not null default 'pending' check (status in ('pending','indexed','failed','retired')),
  indexed_at timestamptz
);
create table knowledge_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  organization_id uuid,
  chunk_index integer not null,
  content text not null,
  page_from integer, page_to integer, section text,
  tokens integer not null,
  embedding vector(1536) not null,               -- dimensão conforme o modelo escolhido
  fts tsvector generated always as (to_tsvector('portuguese', content)) stored
);
create index on knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index on knowledge_chunks using gin (fts);
create table assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references auth.users(id),
  created_at timestamptz default now()
);
create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb not null default '[]',         -- [{chunk_id, document_id, page}]
  model text, input_tokens integer, output_tokens integer,
  feedback smallint check (feedback in (-1, 1)),
  created_at timestamptz default now()
);

-- D. Clínica avançada
alter table anthropometric_assessments add column bone_diameters jsonb;  -- úmero e fêmur
alter table anthropometric_assessments add column somatotype jsonb;      -- {endo, meso, ecto, x, y}

create table lab_tests (
  code text primary key,                         -- 'glucose_fasting','hba1c','ldl'...
  name text not null, unit text not null, loinc_code text,
  category text not null
);
create table lab_reference_ranges (
  id uuid primary key default gen_random_uuid(),
  test_code text not null references lab_tests(code),
  sex text check (sex in ('male','female')), min_age_years numeric, max_age_years numeric,
  low numeric, high numeric, label text,          -- ex.: 'desejável', 'limítrofe'
  source text not null
);
create table lab_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  test_code text not null references lab_tests(code),
  value numeric not null, unit text not null,
  collected_on date not null,
  lab_reference_text text,                        -- referência impressa no laudo
  flag text check (flag in ('low','normal','high')),
  report_path text, entered_by uuid references profiles(id)
);
create index on lab_results (patient_id, test_code, collected_on);

create table supplements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),   -- null = base da plataforma
  name text not null,
  kind text not null check (kind in ('supplement','herbal','compounded')),
  active_ingredients jsonb not null,             -- [{name, amount, unit}]
  regulatory_notes text, source text
);
create table supplement_prescriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  meal_plan_id uuid references meal_plans(id),
  supplement_id uuid references supplements(id),
  free_text text,                                -- manipulado
  dose text not null, frequency text not null, duration text,
  instructions text, prescribed_by uuid not null references profiles(id),
  prescribed_at timestamptz default now()
);
create table patient_medications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  name text not null, active_substance text, dose text,
  started_on date, ended_on date
);
create table interaction_rules (
  id uuid primary key default gen_random_uuid(),
  substance_a text not null,                     -- medicamento ou nutriente/fitoterápico
  substance_b text not null,
  severity text not null check (severity in ('minor','moderate','major')),
  effect text not null, recommendation text not null,
  evidence_level text, source text not null, license text not null
);
create index on interaction_rules (substance_a); create index on interaction_rules (substance_b);

-- E. Marketing
create table brand_kits (
  organization_id uuid primary key references organizations(id),
  primary_color text, secondary_color text, font text, logo_path text,
  tone text, handle_instagram text
);
create table content_pieces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  kind text not null check (kind in ('instagram_post','carousel','story','ebook','handout','email')),
  topic text not null, body jsonb not null, image_paths text[] default '{}',
  status text not null default 'draft' check (status in ('draft','approved','published')),
  ai_suggestion_id uuid, created_by uuid references profiles(id),
  shared_with_patients boolean default false
);

-- F. Chat
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  nutritionist_id uuid not null references profiles(id),
  status text not null default 'open' check (status in ('open','closed')),
  last_message_at timestamptz,
  unique (patient_id, nutritionist_id)
);
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  organization_id uuid not null,
  sender_user_id uuid not null references auth.users(id),
  sender_role text not null check (sender_role in ('nutritionist','patient','guardian')),
  body text, attachment_paths text[] default '{}',
  read_at timestamptz, created_at timestamptz default now()
);
create index on chat_messages (thread_id, created_at);
create table chat_settings (
  organization_id uuid primary key references organizations(id),
  business_hours jsonb, auto_reply text, enabled_for_plans text[]
);

-- G. App nativo
create table push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  platform text not null check (platform in ('ios','android','web')),
  token text not null unique, app_version text,
  last_seen_at timestamptz default now()
);

-- H. FHIR
create table fhir_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid references patients(id),
  requested_by uuid not null references profiles(id),
  resource_types text[] not null, status text not null,
  bundle_path text, created_at timestamptz default now()
);

-- I. Cobrança de pacientes
create table payment_accounts (
  organization_id uuid primary key references organizations(id),
  provider text not null,                        -- 'asaas','mercado_pago','stripe'
  provider_account_id text not null,             -- subconta do profissional
  status text not null, onboarding_url text
);
create table patient_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id),
  appointment_id uuid references appointments(id),
  package_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  method text check (method in ('pix','credit_card','boleto')),
  provider_charge_id text unique, payment_url text,
  status text not null default 'pending' check (status in ('pending','paid','overdue','refunded','cancelled')),
  due_on date, paid_at timestamptz
);
create table payment_webhook_events (
  id text primary key,                           -- id do evento no provedor (idempotência)
  provider text not null, payload jsonb not null,
  processed_at timestamptz
);
```

**RLS principais**
- Triagens, programas, exames, suplementos prescritos, medicações: membro `owner`/`nutritionist` da organização. `assistant` vê inscrição em programa e presença em atividades, mas não scores, exames e medicações.
- `program_indicators` e relatórios epidemiológicos: só agregados, servidos por função `security definer` que aplica o limite mínimo de células (k ≥ 5). Nenhuma política dá `select` direto nas linhas de pacientes para papéis de gestão de programa.
- `knowledge_chunks`: leitura de `organization_id is null` (base curada) ou da própria organização; escrita só por Edge Function com `service_role`.
- `assistant_*`: apenas o próprio usuário lê suas conversas.
- `chat_messages`: o nutricionista da thread, o paciente (`auth_user_id`) e os responsáveis (`is_guardian_of`). `insert` só com `sender_user_id = auth.uid()`. `update` só de `read_at` pelo destinatário. Realtime habilitado só para `chat_messages`, com as mesmas políticas.
- `patient_charges`: o paciente lê as próprias cobranças; a escrita de status é feita só pela Edge Function de webhook.
- `interaction_rules`, `lab_tests`, `lab_reference_ranges`, `supplements` (base pública): leitura para autenticados.

## Regras de cálculo / domínio

### NRS-2002
Referência: Kondrup J. et al. *Nutritional risk screening (NRS 2002): a new method based on an analysis of controlled clinical trials*. Clin Nutr, 2003;22(3):321-336. Adultos hospitalizados.

1. **Triagem inicial** (qualquer "sim" leva à triagem final): IMC < 20,5? Perda de peso nos últimos 3 meses? Redução da ingestão na última semana? Paciente gravemente doente?
2. **Triagem final:** `score = estado_nutricional (0–3) + gravidade_da_doença (0–3) + (idade ≥ 70 ? 1 : 0)`.
   - Estado nutricional: 1 = perda > 5% em 3 meses ou ingestão 50–75% na última semana; 2 = perda > 5% em 2 meses, ou IMC 18,5–20,5 com estado geral comprometido, ou ingestão 25–50%; 3 = perda > 5% em 1 mês (> 15% em 3 meses), ou IMC < 18,5 com estado geral comprometido, ou ingestão 0–25%.
   - Gravidade: 1 = fratura de quadril, doença crônica com complicações agudas, DPOC, hemodiálise, diabetes, câncer; 2 = cirurgia abdominal de grande porte, AVC, pneumonia grave, neoplasia hematológica; 3 = TCE, transplante de medula, UTI com APACHE > 10.
3. **Resultado:** score ≥ 3 indica risco nutricional e plano de cuidado; < 3 indica reavaliar semanalmente.

### MNA
Referências: Guigoz Y., Vellas B., Garry P. J. *Mini Nutritional Assessment*, 1994. Rubenstein L. Z. et al. *Screening for undernutrition in geriatric practice: developing the short-form MNA (MNA-SF)*. J Gerontol, 2001. Kaiser M. J. et al. *Validation of the MNA-SF*. J Nutr Health Aging, 2009. Idosos (≥ 65 anos).

- **MNA-SF** (6 itens, 0–14 pontos): 12–14 = estado nutricional normal; 8–11 = risco de desnutrição; 0–7 = desnutrido. A perda de peso, o IMC (ou a circunferência da panturrilha, quando não houver IMC: < 31 cm = 0, ≥ 31 cm = 3) e os demais itens seguem o formulário oficial.
- **MNA completa** (18 itens, 0–30 pontos): ≥ 24 = normal; 17–23,5 = risco; < 17 = desnutrição.
- O formulário MNA é marca registrada da Nestlé (Société des Produits Nestlé). **A validar** a licença de uso do formulário em software comercial antes de publicar.

### MUST
Referência: BAPEN. *The 'MUST' Explanatory Booklet*, 2003 (rev. 2011). Adultos na comunidade e no hospital.

```
Passo 1 — IMC:            > 20 = 0 | 18,5–20 = 1 | < 18,5 = 2   (IMC ≥ 30 = 0, registrando obesidade)
Passo 2 — Perda de peso não intencional em 3–6 meses: < 5% = 0 | 5–10% = 1 | > 10% = 2
Passo 3 — Doença aguda com ausência (ou provável ausência) de ingestão > 5 dias = 2
Total:    0 = risco baixo | 1 = risco médio | ≥ 2 = risco alto
```
Quando não houver medida de peso ou altura, o MUST permite medidas alternativas (comprimento do antebraço, circunferência do braço). Essas tabelas ficam como **A validar** e só entram se a nutricionista pedir.

### Avaliação Subjetiva Global (ASG / SGA)
Referência: Detsky A. S. et al. *What is subjective global assessment of nutritional status?* JPEN, 1987;11(1):8-13.

Classificação subjetiva pelo avaliador a partir de história (peso, ingestão, sintomas gastrointestinais, capacidade funcional, doença) e exame físico (gordura subcutânea, massa muscular, edema, ascite): **A** = bem nutrido, **B** = moderadamente desnutrido ou suspeito, **C** = gravemente desnutrido. O sistema não calcula a classe: apenas guia o formulário, mostra a sugestão a partir das respostas e o profissional decide.

### Indicadores de programas
| Indicador | Cálculo |
|---|---|
| Prevalência de excesso de peso | inscritos com IMC ≥ 25 (adultos) / inscritos avaliados no período |
| Variação média de peso e IMC | média de (último − linha de base) entre inscritos com ≥ 2 avaliações |
| % que atingiu a meta | inscritos com meta atingida / inscritos ativos |
| Adesão | presenças em atividades / atividades previstas por inscrito |
| Evasão | saídas no período / inscritos no início do período |
| Distribuição do risco nutricional | contagem por `risk_level` da última triagem |

As classificações de IMC de adulto e idoso seguem a Norma Técnica do SISVAN (2011): adultos pela OMS (< 18,5; 18,5–24,9; 25–29,9; ≥ 30) e idosos por Lipschitz (1994): < 22 baixo peso, 22–27 eutrofia, > 27 sobrepeso (**A validar**).

**Anonimização:** relatórios por território suprimem células com menos de 5 pessoas (k ≥ 5) e nunca exibem identificadores.

### Somatotipo de Heath-Carter
Referência: Carter J. E. L., Heath B. H. *Somatotyping: Development and Applications*. Cambridge University Press, 1990. Carter J. E. L. *The Heath-Carter Anthropometric Somatotype: Instruction Manual*, 2002.

Dobras em mm, perímetros e diâmetros em cm, estatura em cm, massa em kg.

```
Endomorfia:
  X = (tríceps + subescapular + supraespinal) × (170,18 / estatura)
  endo = −0,7182 + 0,1451·X − 0,00068·X² + 0,0000014·X³

Mesomorfia:
  braço_corr       = perímetro do braço contraído − (tríceps / 10)
  panturrilha_corr = perímetro da panturrilha − (dobra da panturrilha / 10)
  meso = 0,858·úmero + 0,601·fêmur + 0,188·braço_corr + 0,161·panturrilha_corr − 0,131·estatura + 4,5

Ectomorfia:
  HWR = estatura / ∛massa
  se HWR ≥ 40,75:            ecto = 0,732·HWR − 28,58
  se 38,25 < HWR < 40,75:    ecto = 0,463·HWR − 17,63
  se HWR ≤ 38,25:            ecto = 0,1

Somatocarta:
  x = ecto − endo
  y = 2·meso − (endo + ecto)
```
Componentes ≤ 0 são registrados como 0,1 (convenção do manual).

### Exames laboratoriais
- Valores de referência com fonte por faixa (ex.: diretrizes da SBD para glicemia e HbA1c; da SBC para lipídios). Todos **A validar** com a nutricionista e versionados por fonte.
- O laudo do laboratório prevalece: o sistema guarda `lab_reference_text` e usa a faixa do catálogo só quando o laudo não informar.
- Flag `low/normal/high` calculada na gravação; gráfico de evolução por exame.

### Interações droga-nutriente
- O sistema compara as substâncias dos medicamentos em uso (`patient_medications`) e dos suplementos e fitoterápicos prescritos com `interaction_rules`, e também com alimentos marcados no plano (ex.: varfarina × vitamina K, levotiroxina × cálcio/ferro, IMAO × tiramina).
- A base de interações precisa de fonte licenciada ou curada com referências (ex.: compêndios de interação, monografias de fitoterápicos da ANVISA/Formulário de Fitoterápicos da Farmacopeia Brasileira). **A validar** fonte e licença antes de qualquer desenvolvimento além do seed de exemplo.
- Alerta é informativo e nunca bloqueia; o profissional registra ciência.
- Fitoterápicos: a prescrição por nutricionista segue a regulamentação do CFN (Resolução CFN nº 680/2021 e atualizações, **A validar**), que exige título de especialista para alguns casos; o sistema registra a habilitação no perfil do profissional.

### Assistente RAG
- Base curada pela plataforma (diretrizes públicas com licença compatível, Guia Alimentar para a População Brasileira, Guia para menores de 2 anos, tabelas TACO/TBCA) mais documentos próprios da organização.
- Recuperação híbrida: busca vetorial (cosseno, top 20) + busca textual em português (`tsvector`), combinadas por Reciprocal Rank Fusion, depois reranqueamento e top 6 para o contexto.
- O modelo responde só com base no contexto e cita cada afirmação no formato `[n]` ligado ao documento e à página. Sem contexto relevante (score abaixo do limiar), responde que não encontrou na base.
- Nenhum dado identificável de paciente vai para o assistente; se o usuário colar dados, a interface avisa.
- Avaliação offline: conjunto de 50 perguntas com resposta esperada e fonte, medindo acerto da fonte (recall@6) e fidelidade da resposta.

### Cobrança de pacientes
- Modelo de subconta (marketplace) no provedor para que o dinheiro caia direto na conta do profissional; a Rafanutri não custodia valores.
- Webhooks idempotentes (`payment_webhook_events.id`), verificação de assinatura e reconciliação diária.
- Ao pagar, gera recibo (RN-055) e lança no financeiro (RN-053).

## Rotas e telas

| Rota Next.js | Tela | Papel que acessa |
|---|---|---|
| `/app/patients/[id]/screenings` | Histórico de triagens do paciente | owner, nutritionist |
| `/app/patients/[id]/screenings/new?tool=` | Formulário guiado da triagem escolhida | owner, nutritionist |
| `/app/screenings/campaign` | Triagem rápida em lote (campanha) | owner, nutritionist |
| `/app/territories` | Territórios (UBS, bairros, escolas) | owner |
| `/app/programs` | Lista de programas | owner, nutritionist |
| `/app/programs/[id]` | Programa: inscritos, atividades, metas | owner, nutritionist, assistant (inscrição e presença) |
| `/app/programs/[id]/indicators` | Indicadores coletivos | owner, nutritionist |
| `/app/reports/epidemiology` | Relatórios por território (agregados) | owner, nutritionist |
| `/app/assistant` | Assistente RAG com citações | owner, nutritionist |
| `/app/settings/knowledge` | Documentos da base de conhecimento da organização | owner, nutritionist |
| `/app/patients/[id]/assessments/[aid]/somatotype` | Somatotipo e somatocarta | owner, nutritionist |
| `/app/patients/[id]/labs` | Exames: registro, evolução e upload de laudo | owner, nutritionist |
| `/app/patients/[id]/medications` | Medicamentos em uso | owner, nutritionist |
| `/app/patients/[id]/supplements` | Prescrição de suplementos e fitoterápicos com alertas | owner, nutritionist |
| `/app/marketing` | Gerador de conteúdo e biblioteca | owner, nutritionist |
| `/app/settings/brand` | Kit de marca | owner |
| `/app/chat` | Caixa de entrada de conversas | owner, nutritionist |
| `/app/settings/chat` | Horário de atendimento e resposta automática | owner |
| `/app/patients/[id]/fhir` | Exportar/importar dados FHIR do paciente | owner, nutritionist |
| `/app/settings/payments` | Conta de recebimento (onboarding no provedor) | owner |
| `/app/finance/charges` | Cobranças de pacientes | owner, nutritionist, assistant |
| `/p/chat` | Chat no app do paciente | patient, guardian |
| `/p/materials` | Materiais compartilhados | patient, guardian |
| `/p/payments` | Cobranças e pagamento | patient, guardian |
| `/pay/[token]` | Página pública de pagamento | público (token) |
| App nativo (Expo Router): `/(tabs)/today`, `/(tabs)/diary`, `/(tabs)/water`, `/(tabs)/chat`, `/(tabs)/profile` | App do paciente | patient, guardian |

## Itens do backlog

### RN-170 — Base de triagens nutricionais
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-008, RN-020
- **Descrição:** Tabela `nutrition_screenings` e motor genérico de formulários de triagem versionados.
- **Tarefas técnicas:**
  - [ ] Migração com RLS e auditoria
  - [ ] Interface `ScreeningTool<Answers>` no `nutrition-core` (`validate`, `score`, `classify`, `version`)
  - [ ] Componente de formulário guiado passo a passo reutilizável
  - [ ] Linha do tempo do prontuário exibindo triagens
- **Arquivos/áreas:** `supabase/migrations/`, `packages/nutrition-core/src/screening/`, `packages/ui/src/screening/`
- **Critérios de aceite:** Dada uma nova ferramenta registrada no `nutrition-core`, quando adicionada à lista, então aparece na tela de triagem sem nova migração.
- **Testes:** unidade, RLS.

### RN-171 — NRS-2002
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-170
- **Descrição:** Triagem inicial e final com cálculo automático da perda de peso e do IMC a partir da última avaliação.
- **Tarefas técnicas:**
  - [ ] Implementar `nrs2002` com as tabelas de estado nutricional e gravidade
  - [ ] Pré-preenchimento de IMC, idade e perda de peso
  - [ ] Recomendação de conduta conforme o score
- **Arquivos/áreas:** `packages/nutrition-core/src/screening/nrs2002.ts`, `apps/web/app/(app)/patients/[id]/screenings/`
- **Critérios de aceite:** Dado um paciente de 72 anos com estado nutricional 1 e gravidade 1, quando concluir, então o score é 3 e a classificação é "em risco nutricional".
- **Testes:** unidade (casos do artigo original), e2e.

### RN-172 — MNA completa e MNA-SF
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-170
- **Descrição:** As duas versões, com a MNA-SF podendo evoluir para a completa quando der risco.
- **Tarefas técnicas:**
  - [ ] Verificar a licença do formulário (A validar) antes de publicar
  - [ ] `mnaSf` e `mnaFull` com os pontos de corte
  - [ ] Alternativa da circunferência da panturrilha na MNA-SF
  - [ ] Botão "continuar para MNA completa" reaproveitando respostas
- **Arquivos/áreas:** `packages/nutrition-core/src/screening/mna.ts`, `apps/web/app/(app)/patients/[id]/screenings/`
- **Critérios de aceite:** Dada uma MNA-SF com total 10, quando concluir, então a classificação é "risco de desnutrição" e o sistema oferece continuar para a completa.
- **Testes:** unidade (limites 7/8, 11/12, 17/23,5/24), e2e.

### RN-173 — MUST
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-170
- **Descrição:** Os 3 passos do MUST com cálculo automático a partir do histórico de peso.
- **Tarefas técnicas:**
  - [ ] `must` com os três passos
  - [ ] Cálculo de % de perda de peso nos últimos 3–6 meses a partir das avaliações
  - [ ] Recomendação de conduta por nível de risco (BAPEN)
- **Arquivos/áreas:** `packages/nutrition-core/src/screening/must.ts`
- **Critérios de aceite:** Dado um paciente com IMC 19 e perda de 7% em 4 meses, quando concluir, então o total é 2 e o risco é alto.
- **Testes:** unidade, e2e.

### RN-174 — Avaliação Subjetiva Global e triagem em campanha
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-171, RN-172, RN-173
- **Descrição:** Formulário ASG e tela de triagem rápida em lote para campanhas e ambulatórios.
- **Tarefas técnicas:**
  - [ ] Formulário ASG com sugestão de classe e decisão final do profissional
  - [ ] Tela de campanha: cadastro mínimo de paciente + triagem em sequência, otimizada para tablet
  - [ ] Lista de pacientes em risco ao final, com exportação
- **Arquivos/áreas:** `packages/nutrition-core/src/screening/sga.ts`, `apps/web/app/(app)/screenings/campaign/`
- **Critérios de aceite:** Dada uma campanha, quando o nutricionista tria 30 pessoas, então leva menos de 2 minutos por pessoa e termina com a lista das que estão em risco.
- **Testes:** e2e.

### RN-175 — Migração de territórios e programas
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-170
- **Descrição:** Criar `territories`, `programs`, `program_enrollments` e `program_activities`.
- **Tarefas técnicas:**
  - [ ] Migração, RLS e auditoria
  - [ ] `patients.territory_id`
  - [ ] Seed de programas de exemplo (hipertensos, diabéticos, gestantes)
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dado um assistant, quando consultar inscritos de um programa, então vê nomes e presença, mas não a linha de base clínica.
- **Testes:** RLS.

### RN-176 — Gestão de programas e grupos
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-175
- **Descrição:** Criar programas, inscrever pacientes (individualmente ou por filtro), registrar atividades em grupo e presença.
- **Tarefas técnicas:**
  - [ ] CRUD de programas com metas
  - [ ] Inscrição em lote por filtro (ex.: todos com a triagem em risco)
  - [ ] Linha de base capturada da última avaliação no momento da inscrição
  - [ ] Atividades e lista de presença
  - [ ] Lembretes de atividade por WhatsApp via n8n
- **Arquivos/áreas:** `apps/web/app/(app)/programs/`, `n8n/workflows/program-reminders.json`
- **Critérios de aceite:** Dado um programa de hipertensos, quando inscrever 40 pacientes por filtro, então todos entram com a linha de base preenchida.
- **Testes:** e2e.

### RN-177 — Indicadores coletivos
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-176
- **Descrição:** Painel com os indicadores do programa por mês, comparando com as metas.
- **Tarefas técnicas:**
  - [ ] Visão materializada `program_indicators` com atualização agendada
  - [ ] Gráficos de evolução e de distribuição de risco
  - [ ] Exportação CSV e PDF
- **Arquivos/áreas:** `supabase/migrations/`, `apps/web/app/(app)/programs/[id]/indicators/`
- **Critérios de aceite:** Dado um programa com 3 meses de acompanhamento, quando abrir os indicadores, então vê a variação média de IMC e a % de inscritos que bateram a meta, mês a mês.
- **Testes:** integração (cálculo das visões com dados sintéticos).

### RN-178 — Relatórios epidemiológicos por território
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-177
- **Descrição:** Estado nutricional e risco por território, faixa etária e sexo, com anonimização.
- **Tarefas técnicas:**
  - [ ] Função `epidemiology_report(org, period, group_by)` com supressão de células < 5
  - [ ] Classificações de IMC por fase da vida (SISVAN)
  - [ ] Tabelas e gráficos por território; mapa opcional se houver `ibge_code`
- **Arquivos/áreas:** `supabase/migrations/`, `apps/web/app/(app)/reports/epidemiology/`
- **Critérios de aceite:** Dado um território com 3 idosos com obesidade, quando gerar o relatório, então a célula aparece como "< 5" e não com o número.
- **Testes:** integração (supressão), RLS.

### RN-179 — Estudo de exportação SISVAN/e-SUS
- **Tipo:** pesquisa
- **Pontos:** 3
- **Depende de:** RN-178
- **Descrição:** Levantar formatos, requisitos e viabilidade de enviar dados de acompanhamento nutricional ao SISVAN/e-SUS APS.
- **Tarefas técnicas:**
  - [ ] Levantar a documentação técnica do e-SUS APS (LEDI/Thrift) e do SISVAN Web
  - [ ] Mapear campos da Rafanutri para os campos exigidos
  - [ ] Identificar necessidade de credenciamento e de CNES
  - [ ] Registrar a decisão em `docs/adr/`
- **Arquivos/áreas:** `docs/pesquisa/sisvan-esus.md`, `docs/adr/`
- **Critérios de aceite:** Dado o estudo, quando concluído, então há um ADR com a recomendação (fazer, adiar ou não fazer) e o esforço estimado.
- **Testes:** não se aplica.

### RN-180 — Migração da base de conhecimento (pgvector)
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-075
- **Descrição:** Extensão `vector`, tabelas `knowledge_documents`, `knowledge_chunks`, `assistant_conversations` e `assistant_messages`.
- **Tarefas técnicas:**
  - [ ] Migração com índices HNSW e GIN
  - [ ] Função `match_knowledge(query_embedding, query_text, org_id, k)` com busca híbrida e RRF
  - [ ] RLS para a base curada e a da organização
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dados chunks de duas organizações, quando a organização A consultar, então só recebe chunks da base curada e os seus.
- **Testes:** RLS, integração.

### RN-181 — Pipeline de ingestão de documentos
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-180
- **Descrição:** Upload de PDF/HTML, extração de texto, divisão em trechos, embeddings e indexação.
- **Tarefas técnicas:**
  - [ ] Edge Function `ingest-document` com fila (status `pending → indexed/failed`)
  - [ ] Extração preservando página e seção
  - [ ] Divisão em trechos de ~800 tokens com 100 de sobreposição
  - [ ] Embeddings em lote com nova tentativa
  - [ ] Curadoria da base inicial com licenças registradas
- **Arquivos/áreas:** `supabase/functions/ingest-document/`, `apps/web/app/(app)/settings/knowledge/`
- **Critérios de aceite:** Dado o PDF do Guia Alimentar para a População Brasileira, quando enviado, então fica `indexed` com cada trecho apontando para a página certa.
- **Testes:** integração (documento de exemplo).

### RN-182 — Assistente RAG com citações
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-181
- **Descrição:** Chat do nutricionista que responde com base na base de conhecimento e cita as fontes.
- **Tarefas técnicas:**
  - [ ] Edge Function `assistant-answer` com recuperação, reranqueamento e geração em streaming
  - [ ] Prompt que obriga citação `[n]` e recusa sem contexto
  - [ ] Interface com fontes clicáveis (documento e página)
  - [ ] Aviso ao detectar dados pessoais na pergunta
  - [ ] Contagem de tokens e limite por plano (RN-077)
  - [ ] Feedback 👍/👎 por resposta
- **Arquivos/áreas:** `supabase/functions/assistant-answer/`, `apps/web/app/(app)/assistant/`
- **Critérios de aceite:** Dada a pergunta "qual a recomendação de introdução de ovo?", quando respondida, então a resposta cita o Guia para menores de 2 anos com a página; dada uma pergunta fora da base, então o assistente diz que não encontrou.
- **Testes:** integração (com o LLM simulado), avaliação (RN-183).

### RN-183 — Avaliação de qualidade do RAG
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-182
- **Descrição:** Conjunto de perguntas de referência e script de avaliação para medir regressões.
- **Tarefas técnicas:**
  - [ ] 50 perguntas com resposta e fonte esperadas, revisadas pela nutricionista
  - [ ] Script que mede recall@6 da fonte e fidelidade (LLM como juiz com rubrica)
  - [ ] Job manual no CI para rodar antes de trocar modelo, prompt ou chunking
- **Arquivos/áreas:** `packages/ai-eval/`, `.github/workflows/rag-eval.yml`
- **Critérios de aceite:** Dado o conjunto, quando rodar a avaliação, então o relatório mostra recall@6 ≥ 0,85 e nenhuma resposta sem citação.
- **Testes:** avaliação.

### RN-184 — Somatotipo de Heath-Carter
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-028
- **Descrição:** Cálculo dos três componentes e somatocarta a partir da avaliação antropométrica.
- **Tarefas técnicas:**
  - [ ] Campos de diâmetros ósseos (úmero, fêmur) e perímetros de braço contraído e panturrilha
  - [ ] `heathCarter(input)` no `nutrition-core` com as fórmulas do manual
  - [ ] Somatocarta (triângulo de Reuleaux) com o ponto atual e os anteriores
- **Arquivos/áreas:** `packages/nutrition-core/src/anthropometry/somatotype.ts`, `packages/ui/src/charts/Somatochart.tsx`
- **Critérios de aceite:** Dados os exemplos do manual de Carter (2002), quando calcular, então cada componente difere no máximo 0,1 do valor publicado.
- **Testes:** unidade (exemplos do manual), e2e.

### RN-185 — Catálogo de exames e valores de referência
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-008
- **Descrição:** Tabelas `lab_tests` e `lab_reference_ranges` com os exames mais usados na prática nutricional.
- **Tarefas técnicas:**
  - [ ] Seed de ~40 exames (glicemia, HbA1c, insulina, perfil lipídico, TSH, ferritina, vitamina D, B12, PCR, creatinina, ureia, TGO/TGP etc.) com código LOINC
  - [ ] Faixas de referência com fonte por faixa (A validar)
  - [ ] Revisão pela nutricionista RT
- **Arquivos/áreas:** `supabase/migrations/`, `supabase/seed/labs/`
- **Critérios de aceite:** Dado o exame "HbA1c", quando consultado, então tem unidade, LOINC e faixas com fonte.
- **Testes:** integração.

### RN-186 — Registro e evolução de exames
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-185
- **Descrição:** Lançar resultados (manual ou em grade), anexar laudo em PDF e ver gráficos de evolução.
- **Tarefas técnicas:**
  - [ ] Grade de lançamento rápido por data de coleta
  - [ ] Upload de laudo no Storage privado
  - [ ] Flag automática e destaque de alterados
  - [ ] Gráfico de evolução com a faixa de referência
  - [ ] (Opcional) extração assistida por IA do laudo, sempre com conferência
- **Arquivos/áreas:** `apps/web/app/(app)/patients/[id]/labs/`
- **Critérios de aceite:** Dados 3 resultados de LDL em datas diferentes, quando abrir o exame, então vê a curva com a faixa desejável sombreada.
- **Testes:** e2e, RLS.

### RN-187 — Suplementos e fitoterápicos
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-031
- **Descrição:** Base de suplementos e fitoterápicos, prescrição com posologia e inclusão no PDF do plano.
- **Tarefas técnicas:**
  - [ ] Migração `supplements`, `supplement_prescriptions`, `patient_medications`
  - [ ] Seed inicial de suplementos comuns e fitoterápicos da lista da ANVISA (A validar)
  - [ ] Prescrição de manipulados em texto livre com campos estruturados
  - [ ] Registro de habilitação do profissional para fitoterapia (CFN)
  - [ ] Seção "Suplementação" no PDF do plano alimentar
- **Arquivos/áreas:** `supabase/migrations/`, `apps/web/app/(app)/patients/[id]/supplements/`, `apps/web/lib/pdf/`
- **Critérios de aceite:** Dado um profissional sem habilitação em fitoterapia, quando tentar prescrever um fitoterápico que a exige, então o sistema avisa e pede confirmação da habilitação.
- **Testes:** e2e, RLS.

### RN-188 — Alertas de interação droga-nutriente
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-187
- **Descrição:** Cruzar medicamentos, suplementos e alimentos do plano com a base de interações e exibir alertas.
- **Tarefas técnicas:**
  - [ ] Pesquisa e decisão sobre a fonte da base (licenciada ou curada) — A validar
  - [ ] Migração `interaction_rules` e seed de 30 interações clássicas com referência
  - [ ] `checkInteractions(medications, supplements, foods)` no `nutrition-core`
  - [ ] Alertas na prescrição e no editor de plano, com registro de ciência
- **Arquivos/áreas:** `packages/nutrition-core/src/interactions/`, `apps/web/app/(app)/patients/[id]/supplements/`
- **Critérios de aceite:** Dado um paciente em uso de varfarina, quando o plano inclui grande quantidade de couve, então aparece um alerta moderado com a recomendação e a fonte.
- **Testes:** unidade, e2e.

### RN-189 — Gerador de conteúdo de marketing
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-075, RN-077
- **Descrição:** Gerar posts, carrosséis e e-books educativos com a identidade visual do profissional.
- **Tarefas técnicas:**
  - [ ] Kit de marca (`brand_kits`)
  - [ ] Geração de texto estruturado pelo LLM por tema, público e formato
  - [ ] Templates de imagem (1080×1080, 1080×1350, 1080×1920) renderizados no servidor com as cores e o logo
  - [ ] Revisão e aprovação antes de baixar
  - [ ] Checagem de afirmações proibidas pelo Código de Ética do CFN (ex.: promessa de resultado, divulgação de antes e depois) — regras A validar
- **Arquivos/áreas:** `apps/web/app/(app)/marketing/`, `supabase/functions/generate-content/`
- **Critérios de aceite:** Dado o tema "hidratação no verão", quando gerar um carrossel, então o nutricionista recebe 5 imagens com a sua marca e um texto de legenda editável.
- **Testes:** integração (com LLM simulado), e2e.

### RN-190 — Biblioteca de materiais para pacientes
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-189, RN-071
- **Descrição:** Materiais (receitas, orientações, e-books) que o nutricionista compartilha com pacientes no app.
- **Tarefas técnicas:**
  - [ ] Biblioteca com tags e busca
  - [ ] Compartilhar com um paciente, um grupo ou um programa
  - [ ] Tela `/p/materials` no app
- **Arquivos/áreas:** `apps/web/app/(app)/marketing/`, `apps/web/app/(patient)/p/materials/`
- **Critérios de aceite:** Dado um e-book compartilhado com um programa, quando um inscrito abrir o app, então o material aparece em "Materiais".
- **Testes:** e2e, RLS.

### RN-191 — Chat: modelo de dados e segurança
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-118
- **Descrição:** Tabelas de chat, políticas RLS e Realtime.
- **Tarefas técnicas:**
  - [ ] Migração `chat_threads`, `chat_messages`, `chat_settings`
  - [ ] RLS para nutricionista, paciente e responsável
  - [ ] Publicação Realtime só de `chat_messages`
  - [ ] Bucket privado `chat-attachments`
  - [ ] Mensagens fazem parte do prontuário (retenção e exportação)
- **Arquivos/áreas:** `supabase/migrations/`
- **Critérios de aceite:** Dado um paciente, quando assinar o canal Realtime de outra thread, então não recebe nenhuma mensagem.
- **Testes:** RLS, integração (Realtime).

### RN-192 — Chat: interface web e app
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-191
- **Descrição:** Caixa de entrada do nutricionista e chat no app do paciente, com anexos, leitura e horário de atendimento.
- **Tarefas técnicas:**
  - [ ] Caixa de entrada com não lidas, busca e filtro
  - [ ] Envio de texto, imagem e PDF; prévia de imagem
  - [ ] Confirmação de leitura
  - [ ] Resposta automática fora do horário
  - [ ] Push para o destinatário e opção de notificação por WhatsApp via n8n
  - [ ] Liberação do chat por plano (RN-057)
- **Arquivos/áreas:** `apps/web/app/(app)/chat/`, `apps/web/app/(patient)/p/chat/`, `n8n/workflows/chat-notify.json`
- **Critérios de aceite:** Dado um paciente que envia uma foto às 22h, quando o horário de atendimento termina às 18h, então recebe a resposta automática e o nutricionista vê a mensagem como não lida no dia seguinte.
- **Testes:** e2e (dois navegadores).

### RN-193 — App nativo: base Expo
- **Tipo:** infra
- **Pontos:** 5
- **Depende de:** RN-070
- **Descrição:** Criar `apps/mobile` com Expo Router, autenticação e reaproveitamento dos pacotes.
- **Tarefas técnicas:**
  - [ ] `apps/mobile` com Expo SDK estável e Expo Router
  - [ ] Supabase Auth com magic link via deep link e armazenamento seguro de sessão
  - [ ] Reaproveitar `nutrition-core` e `db`; tema da marca do nutricionista
  - [ ] EAS Build para iOS e Android e canais de atualização OTA
  - [ ] Pipeline de build no GitHub Actions
- **Arquivos/áreas:** `apps/mobile/`, `packages/nutrition-core`, `packages/db`, `.github/workflows/mobile.yml`
- **Critérios de aceite:** Dado um paciente convidado, quando abrir o magic link no celular com o app instalado, então entra direto no app autenticado.
- **Testes:** unidade, e2e (Maestro ou Detox, em um fluxo).

### RN-194 — App nativo: funcionalidades e publicação
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-193, RN-192
- **Descrição:** Paridade com o PWA (plano do dia, diário, hidratação, lista de compras, chat, materiais) e publicação nas lojas.
- **Tarefas técnicas:**
  - [ ] Telas em abas
  - [ ] Push com Expo Notifications e tabela `push_devices`
  - [ ] Cache offline do plano do dia
  - [ ] Câmera para foto de refeição e anexo no chat
  - [ ] Política de privacidade, declarações de dados de saúde nas lojas e contas de teste para revisão
  - [ ] Publicação na App Store e Google Play
- **Arquivos/áreas:** `apps/mobile/app/`, `supabase/functions/send-push/`
- **Critérios de aceite:** Dado o app publicado nas duas lojas, quando um paciente do beta registra a hidratação offline, então o registro sincroniza ao reconectar.
- **Testes:** e2e (fluxos principais), teste manual em dispositivos reais.

### RN-195 — FHIR: mapeamento de recursos
- **Tipo:** pesquisa
- **Pontos:** 3
- **Depende de:** RN-023, RN-028
- **Descrição:** Definir o mapeamento dos dados da Rafanutri para FHIR R4 e os perfis brasileiros (RNDS) aplicáveis.
- **Tarefas técnicas:**
  - [ ] Mapear: `Patient`, `Practitioner`, `Organization`, `Encounter` (consulta), `Observation` (peso, altura, IMC, dobras, exames com LOINC), `NutritionOrder` (plano alimentar), `QuestionnaireResponse` (anamnese e triagens), `Condition`, `MedicationStatement`
  - [ ] Levantar os perfis e requisitos da RNDS (A validar)
  - [ ] Documentar em `docs/integracoes/fhir.md`
- **Arquivos/áreas:** `docs/integracoes/`
- **Critérios de aceite:** Dado o documento, quando um dev for implementar, então encontra a tabela campo a campo com códigos LOINC/SNOMED e exemplos de recurso.
- **Testes:** não se aplica.

### RN-196 — FHIR: exportação e importação
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-195
- **Descrição:** Exportar o prontuário nutricional do paciente como Bundle FHIR e importar `Patient` e `Observation` de outros sistemas.
- **Tarefas técnicas:**
  - [ ] Pacote `packages/fhir` com os mapeadores e validação de schema
  - [ ] Edge Function `fhir-export` gerando Bundle (JSON) no Storage
  - [ ] Importação com pré-visualização e conciliação de paciente existente
  - [ ] Uso da exportação também para o direito de portabilidade da LGPD
  - [ ] Validação com o validador oficial do HL7
- **Arquivos/áreas:** `packages/fhir/`, `supabase/functions/fhir-export/`, `apps/web/app/(app)/patients/[id]/fhir/`
- **Critérios de aceite:** Dado um paciente com 3 consultas e exames, quando exportar, então o Bundle passa no validador HL7 FHIR R4 sem erros.
- **Testes:** unidade (mapeadores), integração (validador).

### RN-197 — Cobrança de pacientes: conta e gateway
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-057, RN-053
- **Descrição:** Onboarding do profissional como subconta no provedor de pagamento e criação de cobranças Pix, cartão e boleto.
- **Tarefas técnicas:**
  - [ ] Escolha do provedor com suporte a subcontas/split (ADR)
  - [ ] Migração `payment_accounts`, `patient_charges`, `payment_webhook_events`
  - [ ] Fluxo de onboarding (KYC no provedor)
  - [ ] Edge Function `create-charge` com chave do provedor só no servidor
- **Arquivos/áreas:** `supabase/migrations/`, `supabase/functions/create-charge/`, `apps/web/app/(app)/settings/payments/`, `docs/adr/`
- **Critérios de aceite:** Dado um profissional com conta aprovada, quando cria uma cobrança Pix de R$ 250, então o paciente recebe um QR Code válido no ambiente sandbox.
- **Testes:** integração (sandbox), RLS.

### RN-198 — Cobrança de pacientes: link, conciliação e recibo
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-197, RN-055
- **Descrição:** Link de pagamento, envio por WhatsApp, baixa automática por webhook, recibo e lançamento no financeiro.
- **Tarefas técnicas:**
  - [ ] Página pública `/pay/[token]` e tela `/p/payments`
  - [ ] Cobrança automática ao agendar (opcional) ou ao vender um pacote
  - [ ] Webhook idempotente com verificação de assinatura
  - [ ] Recibo automático e lançamento no financeiro
  - [ ] Lembrete de vencimento via n8n
  - [ ] Conciliação diária com o provedor
- **Arquivos/áreas:** `supabase/functions/payment-webhook/`, `apps/web/app/pay/[token]/`, `n8n/workflows/charge-reminders.json`
- **Critérios de aceite:** Dado um webhook de pagamento recebido duas vezes, quando processado, então a cobrança é baixada uma única vez e um único recibo é gerado.
- **Testes:** integração (webhook duplicado e fora de ordem), e2e.

### RN-199 — Robustez: performance, observabilidade e carga
- **Tipo:** infra
- **Pontos:** 5
- **Depende de:** —
- **Descrição:** Preparar a plataforma para escala após a entrada dos módulos avançados.
- **Tarefas técnicas:**
  - [ ] Revisão de índices com `pg_stat_statements` e das políticas RLS mais caras
  - [ ] Teste de carga (k6) nos fluxos de plano alimentar, checklists, chat e assistente
  - [ ] Painéis e alertas no Sentry e nos logs do Supabase (erros, latência p95, custo de IA)
  - [ ] Teste de restauração de backup documentado
  - [ ] Revisão de segurança (OWASP ASVS nível 2) e dependências
- **Arquivos/áreas:** `supabase/migrations/`, `tests/load/`, `docs/operacao/`
- **Critérios de aceite:** Dada uma carga de 500 usuários simultâneos, quando rodar o teste, então a latência p95 das telas principais fica abaixo de 800 ms e a taxa de erro abaixo de 0,5%.
- **Testes:** carga, segurança.

## Sequência semanal

Blocos independentes, ordenados pela prioridade comercial sugerida. Revisar a ordem a cada ciclo com base na demanda.

| Semana | Itens |
|---|---|
| 1 | RN-170, RN-171, RN-173 |
| 2 | RN-172, RN-174 |
| 3 | RN-180, RN-181 |
| 4 | RN-182 |
| 5 | RN-183, RN-184, RN-185 |
| 6 | RN-186, RN-187 |
| 7 | RN-188, RN-191 |
| 8 | RN-192, RN-197 |
| 9 | RN-198, RN-189 |
| 10 | RN-190, RN-175, RN-176 |
| 11 | RN-177, RN-178, RN-179 |
| 12 | RN-193 |
| 13–14 | RN-194 |
| 15 | RN-195 |
| 16–17 | RN-196 |
| 18 | RN-199 |

## Critério de pronto da fase

Por bloco:
- **Triagens:** as quatro ferramentas validadas contra os casos da literatura e pela nutricionista RT; licença da MNA resolvida.
- **Programas:** um programa real com indicadores mensais e relatório por território com supressão de células pequenas.
- **RAG:** recall@6 ≥ 0,85 no conjunto de avaliação, 100% das respostas com citação e recusa correta fora da base.
- **Clínica avançada:** somatotipo dentro de 0,1 dos exemplos do manual; exames com faixas validadas; base de interações com fonte e licença definidas.
- **Marketing:** conteúdos gerados com a marca e revisados antes de baixar.
- **Chat:** isolamento comprovado por teste de Realtime; notificações funcionando.
- **App nativo:** publicado nas duas lojas, com paridade com o PWA.
- **FHIR:** Bundle aprovado no validador oficial.
- **Cobrança:** pagamentos em produção com conciliação diária sem divergência.
- **Robustez:** metas de latência e erro atingidas no teste de carga.

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Licença de instrumentos (MNA) e de bases de interação | Bloqueio legal | Verificar licença antes de desenvolver; alternativas (MUST, NRS-2002) já disponíveis |
| Assistente RAG responder algo errado com aparência de certo | Dano clínico e de reputação | Resposta só com citação, recusa sem contexto, avaliação contínua, aviso de apoio à decisão |
| Reidentificação em relatórios populacionais | LGPD | Supressão k ≥ 5, só agregados, sem acesso direto às linhas |
| Chat virar canal 24 h e sobrecarregar o profissional | Churn do nutricionista | Horário de atendimento, resposta automática, liberação por plano |
| Rejeição nas lojas de apps por dados de saúde | Atraso no app nativo | Seguir as políticas de dados de saúde das lojas desde o início; PWA continua disponível |
| Custódia de dinheiro do paciente | Regulatório (Bacen) | Modelo de subconta: o valor vai direto para o profissional |
| Escopo aberto da fase contínua | Dispersão | Blocos com critério de pronto próprio, priorizados por receita |
| Custo de IA (RAG e marketing) | Margem | Limites por plano, cache de embeddings, modelos menores para tarefas simples |

## Métricas a acompanhar

- Triagens realizadas por mês e % de pacientes em risco com plano de cuidado em até 48 h.
- Programas ativos, inscritos e taxa de evasão.
- Uso do assistente (perguntas por usuário por semana), % de 👍 e custo por resposta.
- % de pacientes com exames registrados e alertas de interação exibidos e confirmados.
- Conteúdos gerados e baixados por profissional.
- Mensagens de chat por paciente e tempo médio de primeira resposta.
- Instalações e usuários ativos do app nativo vs. PWA; avaliação nas lojas.
- Volume pago via cobrança online (TPV) e taxa de inadimplência dos pacientes.
- Latência p95, taxa de erro e custo de infraestrutura por organização.
