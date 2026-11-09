# Fase 4 — Materno-Infantil e Pediatria

## Objetivo

Dar ao nutricionista ferramentas para acompanhar o crescimento de crianças e adolescentes (0 a 19 anos) com os padrões da OMS, acompanhar gestantes e lactantes, e orientar a introdução alimentar. Os responsáveis devem conseguir ver pelo app do paciente o que o nutricionista publicar.

Duração estimada: **4 semanas** (1 a 2 devs).

## Escopo / Fora de escopo

**Escopo**
- Curvas de crescimento da OMS: 0–5 anos (WHO Child Growth Standards, 2006) e 5–19 anos (WHO Growth Reference, 2007).
- Indicadores: peso/idade, comprimento-estatura/idade, peso/comprimento-estatura, IMC/idade e perímetro cefálico/idade.
- Cálculo de escore-z e percentil pelo método LMS, com a correção da OMS para valores extremos.
- Idade corrigida para prematuros.
- Classificação do estado nutricional pelos pontos de corte do SISVAN/OMS.
- Alertas de desvio e de mudança de faixa.
- Gráficos das curvas com os pontos do paciente e relatório em PDF.
- Gestantes: ganho de peso gestacional pelo IMC pré-gestacional, gráfico de acompanhamento e adicional energético.
- Lactação: registro do tipo de aleitamento e adicional energético.
- Introdução alimentar: conteúdos, checklist de alergênicos e progressão de texturas por idade.
- Vínculo de responsável legal com o paciente menor de idade.

**Fora de escopo**
- Curvas para prematuros (Intergrowth-21st, Fenton). Ficam para avaliar depois.
- Curvas para síndromes específicas (Down, Turner etc.).
- Pressão arterial pediátrica e estadiamento puberal de Tanner (avaliar na Fase 6).
- Prescrição de fórmulas infantis com base própria de produtos.

## Pré-requisitos

| Item | Por quê |
|---|---|
| RN-004, RN-007, RN-008 | Organizações, papéis e RLS base |
| RN-009 | Auditoria das tabelas sensíveis |
| RN-020, RN-021 | Cadastro de pacientes e consentimento |
| RN-023 | Prontuário (linha do tempo recebe as novas avaliações) |
| RN-027, RN-028 | `nutrition-core` de antropometria e tela de avaliação, que são estendidos aqui |
| RN-036 | Infra de PDF com a marca do profissional |
| RN-070, RN-071 | PWA do paciente, onde responsáveis veem curvas e conteúdos |

## Modelo de dados

```sql
-- Tabelas de referência da OMS (globais, somente leitura)
create table who_growth_references (
  id            bigint generated always as identity primary key,
  standard      text not null check (standard in ('who_2006','who_2007')),
  indicator     text not null check (indicator in (
                  'weight_for_age','length_height_for_age','weight_for_length',
                  'weight_for_height','bmi_for_age','head_circumference_for_age')),
  sex           text not null check (sex in ('male','female')),
  x_unit        text not null check (x_unit in ('day','month','cm')), -- idade em dias/meses ou comprimento em cm
  x_value       numeric(7,2) not null,
  l             numeric(12,8) not null,
  m             numeric(12,6) not null,
  s             numeric(12,8) not null,
  unique (standard, indicator, sex, x_unit, x_value)
);
create index on who_growth_references (indicator, sex, x_value);

alter table who_growth_references enable row level security;
create policy "who_ref_read" on who_growth_references
  for select to authenticated using (true);

-- Dados perinatais do paciente (prematuridade)
create table patient_birth_data (
  patient_id           uuid primary key references patients(id) on delete cascade,
  organization_id      uuid not null references organizations(id),
  gestational_age_weeks numeric(4,1),        -- ex.: 34.4
  birth_weight_g       integer,
  birth_length_cm      numeric(5,1),
  birth_head_circ_cm   numeric(4,1),
  feeding_type         text check (feeding_type in ('exclusive_breastfeeding','mixed','formula','weaned')),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Medidas pediátricas
create table growth_measurements (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id),
  patient_id         uuid not null references patients(id) on delete cascade,
  measured_at        date not null,
  age_days           integer not null,             -- idade cronológica no dia
  corrected_age_days integer,                       -- preenchido quando prematuro
  weight_kg          numeric(6,3),
  length_height_cm   numeric(5,1),
  measure_position   text check (measure_position in ('recumbent','standing')),
  head_circ_cm       numeric(4,1),
  bmi                numeric(5,2),
  z_scores           jsonb not null default '{}',  -- {"weight_for_age": -0.82, ...}
  percentiles        jsonb not null default '{}',
  classifications    jsonb not null default '{}',  -- {"bmi_for_age": "eutrofia"}
  reference_version  text not null,                -- ex.: "who_2006+who_2007@v1"
  author_id          uuid not null references profiles(id),
  notes              text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on growth_measurements (patient_id, measured_at);

-- Alertas gerados
create table growth_alerts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id      uuid not null references patients(id) on delete cascade,
  measurement_id  uuid not null references growth_measurements(id) on delete cascade,
  indicator       text not null,
  kind            text not null check (kind in ('out_of_range','band_crossing','growth_faltering','rapid_gain')),
  severity        text not null check (severity in ('info','warning','critical')),
  message         text not null,
  acknowledged_by uuid references profiles(id),
  acknowledged_at timestamptz,
  created_at timestamptz default now()
);
create index on growth_alerts (organization_id, acknowledged_at);

-- Gestação
create table pregnancy_records (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations(id),
  patient_id             uuid not null references patients(id) on delete cascade,
  last_menstrual_period  date,
  estimated_due_date     date,
  pre_pregnancy_weight_kg numeric(5,2) not null,
  height_cm              numeric(5,1) not null,
  pre_pregnancy_bmi      numeric(5,2) not null,
  bmi_category           text not null,
  gain_reference         text not null default 'kac_2021' check (gain_reference in ('kac_2021','iom_2009')),
  fetuses                smallint not null default 1,
  status                 text not null default 'active' check (status in ('active','delivered','interrupted')),
  delivered_at           date,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table pregnancy_weight_logs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),
  pregnancy_id        uuid not null references pregnancy_records(id) on delete cascade,
  measured_at         date not null,
  gestational_week    numeric(4,1) not null,
  weight_kg           numeric(5,2) not null,
  gain_kg             numeric(5,2) not null,
  expected_min_kg     numeric(5,2),
  expected_max_kg     numeric(5,2),
  status              text check (status in ('below','adequate','above'))
);
create index on pregnancy_weight_logs (pregnancy_id, measured_at);

create table lactation_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id      uuid not null references patients(id) on delete cascade,
  baby_patient_id uuid references patients(id),
  started_at      date not null,
  ended_at        date,
  feeding_type    text not null check (feeding_type in ('exclusive','predominant','partial')),
  notes           text
);

-- Responsáveis legais
create table patient_guardians (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id),
  patient_id       uuid not null references patients(id) on delete cascade,
  guardian_user_id uuid references auth.users(id),
  full_name        text not null,
  relationship     text not null,      -- mãe, pai, tutor...
  email            text, phone text,
  can_view_app     boolean not null default true,
  created_at timestamptz default now()
);
create unique index on patient_guardians (patient_id, guardian_user_id);

-- Introdução alimentar
create table feeding_intro_contents (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id), -- null = conteúdo padrão da plataforma
  slug          text not null,
  title         text not null,
  min_age_months smallint not null,
  max_age_months smallint,
  method        text check (method in ('traditional','blw','participatory','all')),
  body_md       text not null,
  source        text not null,   -- referência bibliográfica
  published     boolean not null default false
);

create table feeding_intro_progress (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id      uuid not null references patients(id) on delete cascade,
  item_type       text not null check (item_type in ('allergen','texture','food_group')),
  item_code       text not null,   -- ex.: 'egg', 'peanut', 'mashed', 'pieces'
  introduced_at   date,
  reaction        text check (reaction in ('none','mild','moderate','severe')),
  notes           text,
  recorded_by     uuid references auth.users(id),
  unique (patient_id, item_type, item_code)
);
```

**RLS principais**
- Todas as tabelas com `organization_id`: `select/insert/update` para `is_member(organization_id)` com papel `owner` ou `nutritionist`. O papel `assistant` não acessa nenhuma delas.
- `growth_measurements`, `growth_alerts`, `pregnancy_*`, `lactation_records`: o paciente (`patients.auth_user_id = auth.uid()`) e o responsável (`patient_guardians.guardian_user_id = auth.uid() and can_view_app`) têm somente `select`, e só nos registros que o nutricionista marcou como visíveis (flag `shared_with_patient` no registro ou configuração do paciente).
- `feeding_intro_progress`: o responsável pode `insert/update` (registrar alimento introduzido e reação) e o nutricionista revisa.
- `feeding_intro_contents`: leitura para autenticados quando `organization_id is null and published`; escrita só pela organização dona.
- Função auxiliar `is_guardian_of(patient_id uuid) returns boolean` com `security definer`.

## Regras de cálculo / domínio

### Escore-z pelo método LMS (OMS)
Referência: WHO Multicentre Growth Reference Study Group. *WHO Child Growth Standards: Methods and development*. Genebra: OMS, 2006. De Onis M. et al. *Development of a WHO growth reference for school-aged children and adolescents*. Bull WHO, 2007.

```
z = ((X / M)^L − 1) / (L · S)      se L ≠ 0
z = ln(X / M) / S                  se L = 0
```

Para indicadores baseados em peso (peso/idade, peso/comprimento-estatura e IMC/idade), a OMS corrige valores extremos (|z| > 3):

```
SD(k) = M · (1 + L · S · k)^(1/L)
se z > 3:  z* = 3 + (X − SD(3)) / (SD(3) − SD(2))
se z < −3: z* = −3 + (X − SD(−3)) / (SD(−2) − SD(−3))
```

Comprimento-estatura/idade e perímetro cefálico usam o z direto. Os indicadores aos quais a correção se aplica estão marcados como **A validar** contra o manual do WHO Anthro.

- **Percentil:** `p = Φ(z) × 100`, onde Φ é a função de distribuição normal padrão.
- **Interpolação:** as tabelas 0–5 anos são por dia, então usa-se o valor exato. As tabelas 5–19 anos são por mês, e a OMS orienta interpolar linearmente L, M e S entre meses inteiros. Para peso/comprimento-estatura, a interpolação é por 0,1 cm.
- **Comprimento × estatura:** até 24 meses mede-se deitado (comprimento) e depois em pé (estatura). Se a criança com menos de 24 meses foi medida em pé, soma-se 0,7 cm; se a com 24 meses ou mais foi medida deitada, subtrai-se 0,7 cm (OMS, 2006).
- **Faixa de cada indicador:** peso/idade de 0 a 10 anos; peso/comprimento de 45 a 110 cm (0–2 anos); peso/estatura de 65 a 120 cm (2–5 anos); IMC/idade de 0 a 19 anos; estatura/idade de 0 a 19 anos; perímetro cefálico/idade de 0 a 5 anos.
- **Idade:** calculada em dias (`measured_at − birth_date`). Meses = dias / 30,4375.

### Idade corrigida para prematuros
```
idade_corrigida_dias = idade_cronológica_dias − (40 − IG_semanas) × 7
```
Aplicar quando a IG ao nascer for menor que 37 semanas. Usar até 24 meses de idade cronológica; alguns protocolos param aos 12 meses para IG ≥ 32 semanas e vão até 36 meses para extremos (**A validar** com a nutricionista e a SBP). O app plota os dois pontos (cronológico e corrigido) e usa o corrigido para a classificação.

### Classificação SISVAN/OMS
Referência: Brasil. Ministério da Saúde. *Orientações para a coleta e análise de dados antropométricos em serviços de saúde: Norma Técnica do SISVAN*. Brasília, 2011. Todos os pontos de corte abaixo estão marcados como **A validar** contra a norma.

**Crianças de 0 a 5 anos incompletos**

| Indicador | Faixa de z | Classificação |
|---|---|---|
| Peso/idade | < −3 | Muito baixo peso para a idade |
| | ≥ −3 e < −2 | Baixo peso para a idade |
| | ≥ −2 e ≤ +2 | Peso adequado para a idade |
| | > +2 | Peso elevado para a idade |
| Estatura/idade | < −3 | Muito baixa estatura para a idade |
| | ≥ −3 e < −2 | Baixa estatura para a idade |
| | ≥ −2 | Estatura adequada para a idade |
| IMC/idade e peso/estatura | < −3 | Magreza acentuada |
| | ≥ −3 e < −2 | Magreza |
| | ≥ −2 e ≤ +1 | Eutrofia |
| | > +1 e ≤ +2 | Risco de sobrepeso |
| | > +2 e ≤ +3 | Sobrepeso |
| | > +3 | Obesidade |

**Crianças de 5 a 10 anos e adolescentes de 10 a 19 anos (IMC/idade)**

| Faixa de z | Classificação |
|---|---|
| < −3 | Magreza acentuada |
| ≥ −3 e < −2 | Magreza |
| ≥ −2 e ≤ +1 | Eutrofia |
| > +1 e ≤ +2 | Sobrepeso |
| > +2 e ≤ +3 | Obesidade |
| > +3 | Obesidade grave |

A tabela de pontos de corte fica em `packages/nutrition-core/src/pediatrics/cutoffs.ts`, versionada, para permitir atualizar a norma sem migração.

### Alertas
| Tipo | Regra inicial (configurável) |
|---|---|
| `out_of_range` | Classificação diferente de adequado ou eutrofia |
| `band_crossing` | O z cruzou uma linha de referência (−2, −1, +1, +2) entre duas medidas consecutivas |
| `growth_faltering` | Queda de z de peso/idade maior que 0,67 entre medidas com até 3 meses de intervalo (**A validar**) |
| `rapid_gain` | Aumento de z de peso/idade ou IMC/idade maior que 0,67 entre medidas próximas (**A validar**) |

### Ganho de peso gestacional
IMC pré-gestacional = peso pré-gestacional (kg) / altura² (m).

**Referência padrão: curvas brasileiras.** Kac G. et al. *Gestational weight gain charts: results from the Brazilian Maternal and Child Nutrition Consortium*. Am J Clin Nutr, 2021. Adotadas na Caderneta da Gestante do Ministério da Saúde. **A validar** antes do uso.

| IMC pré-gestacional | Faixa de ganho total recomendada (kg) |
|---|---|
| Baixo peso (< 18,5) | 9,7 a 12,2 |
| Eutrofia (18,5 a 24,9) | 8,0 a 12,0 |
| Sobrepeso (25,0 a 29,9) | 7,0 a 9,0 |
| Obesidade (≥ 30,0) | 5,0 a 7,2 |

**Referência alternativa: IOM/NAS.** *Weight Gain During Pregnancy: Reexamining the Guidelines*, 2009 (gestação única).

| IMC pré-gestacional | Ganho total (kg) | Ganho semanal no 2º e 3º trimestres (kg/sem) |
|---|---|---|
| < 18,5 | 12,5 a 18 | 0,44 a 0,58 |
| 18,5 a 24,9 | 11,5 a 16 | 0,35 a 0,50 |
| 25,0 a 29,9 | 7 a 11,5 | 0,23 a 0,33 |
| ≥ 30,0 | 5 a 9 | 0,17 a 0,27 |

A faixa esperada por semana gestacional vem das curvas de percentis do artigo de Kac (tabela importada em `pregnancy_gain_references`, **A validar** o formato dos dados publicados) ou, no IOM, de interpolação linear até a 13ª semana (0,5 a 2 kg) seguida do ganho semanal. Gestação gemelar fica fora do cálculo automático e mostra um aviso.

**Idade gestacional:** `(data_medida − DUM) / 7` em semanas; a DPP é calculada pela regra de Naegele (DUM + 280 dias). Ultrassom do 1º trimestre, quando informado, substitui a DUM.

### Adicional energético na gestação e lactação
Referência: Institute of Medicine. *Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids*, 2005. **A validar** contra a revisão NASEM 2023 das DRIs de energia, que mudou as equações.

| Período | Adicional sobre o gasto pré-gestacional |
|---|---|
| 1º trimestre | + 0 kcal/dia |
| 2º trimestre | + 340 kcal/dia |
| 3º trimestre | + 452 kcal/dia |
| Lactação, 0–6 meses | + 500 kcal/dia − 170 kcal (mobilização de reservas) = + 330 kcal/dia |
| Lactação, 7–12 meses | + 400 kcal/dia |

Na tela de cálculo energético (RN-030), o adicional entra como um campo editável e pré-preenchido.

### Introdução alimentar
Referências: Brasil. Ministério da Saúde. *Guia Alimentar para Crianças Brasileiras Menores de 2 Anos*, 2019. Sociedade Brasileira de Pediatria. *Manual de Alimentação*, 4ª ed., 2018 (**A validar** a edição vigente).

- Aleitamento materno exclusivo até 6 meses; introdução de alimentos a partir de 6 meses.
- Progressão de textura de referência: amassado (6 meses) → pedaços pequenos e macios (7–8 meses) → alimentação da família picada (9–11 meses) → alimentação da família (12 meses).
- Alergênicos acompanhados: ovo, leite de vaca, amendoim, castanhas, trigo, soja, peixe e frutos do mar, gergelim. Sem adiar a introdução sem indicação clínica (**A validar** a recomendação atual da ASBAI/SBP).
- Itens que o sistema destaca como "não oferecer": açúcar e ultraprocessados antes de 2 anos, mel antes de 1 ano, leite de vaca integral como bebida principal antes de 1 ano (**A validar** com o guia).

Os conteúdos exibidos ao responsável citam a fonte e passam por revisão da nutricionista responsável técnica antes da publicação.

## Rotas e telas

| Rota Next.js | Tela | Papel que acessa |
|---|---|---|
| `/app/patients/[id]/growth` | Lista de medidas pediátricas e resumo da classificação atual | owner, nutritionist |
| `/app/patients/[id]/growth/new` | Registro de medida (peso, comprimento/estatura, posição, PC) | owner, nutritionist |
| `/app/patients/[id]/growth/charts` | Curvas OMS por indicador, com z e percentil e alternância entre idade cronológica e corrigida | owner, nutritionist |
| `/app/patients/[id]/growth/report` | Pré-visualização e download do PDF de crescimento | owner, nutritionist |
| `/app/patients/[id]/birth-data` | Dados perinatais (IG, peso ao nascer, aleitamento) | owner, nutritionist |
| `/app/patients/[id]/guardians` | Responsáveis legais e convite para o app | owner, nutritionist, assistant (somente dados cadastrais) |
| `/app/patients/[id]/pregnancy` | Gestação ativa: dados pré-gestacionais, gráfico de ganho e registros | owner, nutritionist |
| `/app/patients/[id]/lactation` | Registro de lactação | owner, nutritionist |
| `/app/patients/[id]/feeding-intro` | Checklist de alergênicos, texturas e grupos alimentares | owner, nutritionist |
| `/app/alerts/growth` | Painel de alertas de crescimento da organização | owner, nutritionist |
| `/app/settings/content/feeding-intro` | Gestão dos conteúdos de introdução alimentar da organização | owner, nutritionist |
| `/p/growth` | Curvas da criança no app (somente leitura) | patient, guardian |
| `/p/feeding-intro` | Conteúdos e checklist de introdução alimentar | guardian |
| `/p/pregnancy` | Gráfico de ganho de peso da gestante | patient |

## Itens do backlog

### RN-100 — Obter e validar as tabelas LMS da OMS
- **Tipo:** pesquisa
- **Pontos:** 2
- **Depende de:** RN-015
- **Descrição:** Baixar as tabelas oficiais (expanded tables) dos padrões 2006 e da referência 2007 e confirmar os termos de uso para software comercial.
- **Tarefas técnicas:**
  - [ ] Baixar as tabelas por dia (0–5 anos) e por mês (5–19 anos) de todos os indicadores e dos dois sexos
  - [ ] Registrar a URL, data de download e checksum de cada arquivo em `supabase/seed/who/SOURCES.md`
  - [ ] Ler os termos de uso da OMS e registrar a conclusão
  - [ ] Separar 30 casos de teste com valores calculados pelo WHO Anthro / AnthroPlus
- **Arquivos/áreas:** `supabase/seed/who/`, `docs/`
- **Critérios de aceite:** Dado o repositório, quando um dev abrir `SOURCES.md`, então encontra a origem, a versão e a licença de cada tabela, mais um CSV de casos de teste.
- **Testes:** não se aplica (insumo para RN-103).

### RN-101 — Migração das tabelas pediátricas
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-008, RN-020
- **Descrição:** Criar `who_growth_references`, `patient_birth_data`, `growth_measurements` e `growth_alerts` com RLS.
- **Tarefas técnicas:**
  - [ ] Escrever a migração conforme o esboço desta fase
  - [ ] Políticas RLS para owner/nutritionist, bloqueio para assistant e leitura do paciente/responsável
  - [ ] Gatilho de auditoria (RN-009) em `growth_measurements`
  - [ ] Regenerar os tipos em `packages/db`
- **Arquivos/áreas:** `supabase/migrations/`, `packages/db`
- **Critérios de aceite:** Dado um assistant da organização A, quando consultar `growth_measurements`, então recebe zero linhas; dado um nutritionist da organização B, quando consultar medidas da A, então recebe zero linhas.
- **Testes:** RLS (pgTAP ou testes de integração com usuários sintéticos).

### RN-102 — Importação das tabelas LMS
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-100, RN-101
- **Descrição:** Script idempotente que carrega as tabelas da OMS em `who_growth_references`.
- **Tarefas técnicas:**
  - [ ] Parser dos arquivos para o formato da tabela (`x_unit` em dias, meses ou cm)
  - [ ] Upsert por chave única e verificação de contagem por indicador/sexo
  - [ ] Comando `pnpm seed:who` documentado no README
- **Arquivos/áreas:** `supabase/seed/who/`, `packages/db/scripts/`
- **Critérios de aceite:** Dado um banco vazio, quando rodar `pnpm seed:who` duas vezes, então a contagem de linhas é a mesma e bate com os arquivos de origem.
- **Testes:** integração (contagem e amostra de linhas).

### RN-103 — `nutrition-core`: escore-z e percentil LMS
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-100
- **Descrição:** Funções puras para calcular z e percentil, com correção para extremos e interpolação.
- **Tarefas técnicas:**
  - [ ] `lmsZScore(x, {l, m, s})` e `lmsValueAtZ(z, {l, m, s})`
  - [ ] `adjustedZScore` para indicadores baseados em peso (|z| > 3)
  - [ ] `interpolateLms(rows, x)` para idade em meses e comprimento em 0,1 cm
  - [ ] `zToPercentile(z)` com aproximação de alta precisão da normal
  - [ ] Ajuste de ±0,7 cm entre comprimento e estatura
  - [ ] Interface `GrowthReferenceProvider` para não depender do banco
- **Arquivos/áreas:** `packages/nutrition-core/src/pediatrics/`
- **Critérios de aceite:** Dados os 30 casos de RN-100, quando calcular o z, então a diferença para o WHO Anthro é ≤ 0,01 em todos os casos.
- **Testes:** unidade (casos de referência, L = 0, extremos, limites de faixa).

### RN-104 — `nutrition-core`: idade e idade corrigida
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-103
- **Descrição:** Calcular idade em dias e meses e a idade corrigida de prematuros.
- **Tarefas técnicas:**
  - [ ] `ageInDays(birthDate, measuredAt)`
  - [ ] `correctedAgeDays(ageDays, gestationalAgeWeeks)` com corte configurável (padrão 24 meses)
  - [ ] Bloquear idade negativa e medida anterior ao nascimento
- **Arquivos/áreas:** `packages/nutrition-core/src/pediatrics/age.ts`
- **Critérios de aceite:** Dado um bebê nascido com 32 semanas e 120 dias de vida, quando calcular a idade corrigida, então retorna 64 dias.
- **Testes:** unidade.

### RN-105 — `nutrition-core`: classificação SISVAN/OMS
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-103
- **Descrição:** Classificar cada indicador pela faixa etária e retornar o rótulo e a severidade.
- **Tarefas técnicas:**
  - [ ] Tabela versionada de pontos de corte (`cutoffs.ts`)
  - [ ] `classify(indicator, z, ageDays)` retornando `{label, severity, cutoffVersion}`
  - [ ] Validar a tabela com a nutricionista RT e registrar a validação
- **Arquivos/áreas:** `packages/nutrition-core/src/pediatrics/cutoffs.ts`
- **Critérios de aceite:** Dada uma criança de 3 anos com z de IMC/idade = +1,5, quando classificar, então retorna "Risco de sobrepeso"; dado um adolescente de 12 anos com o mesmo z, então retorna "Sobrepeso".
- **Testes:** unidade (cada fronteira de faixa, com valores iguais ao ponto de corte).

### RN-106 — Tela de registro de medida pediátrica
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-101, RN-104, RN-105
- **Descrição:** Formulário de medida que calcula e grava z, percentil e classificação.
- **Tarefas técnicas:**
  - [ ] Formulário com React Hook Form + Zod (limites plausíveis por idade)
  - [ ] Cálculo em tempo real ao digitar
  - [ ] Server Action que recalcula no servidor e grava `reference_version`
  - [ ] Tela de dados perinatais (`patient_birth_data`)
  - [ ] Aviso quando a posição de medida não corresponde à idade
- **Arquivos/áreas:** `apps/web/app/(app)/patients/[id]/growth/`, `packages/ui`
- **Critérios de aceite:** Dado um paciente de 18 meses, quando o nutricionista informa peso, comprimento e PC, então o sistema mostra z, percentil e classificação de cada indicador e grava a medida na linha do tempo do prontuário.
- **Testes:** unidade (schemas Zod), e2e (registro completo).

### RN-107 — Gráficos das curvas OMS
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-102, RN-106
- **Descrição:** Curvas com linhas de z −3, −2, 0, +2, +3 (ou percentis 3, 15, 50, 85, 97) e os pontos do paciente.
- **Tarefas técnicas:**
  - [ ] Componente `GrowthChart` (Recharts) com as linhas geradas por `lmsValueAtZ`
  - [ ] Alternância entre z e percentil, e entre idade cronológica e corrigida
  - [ ] Cores das faixas acessíveis em tema claro e escuro
  - [ ] Tooltip com data, valor, z, percentil e classificação
  - [ ] Cache das curvas por indicador e sexo
- **Arquivos/áreas:** `packages/ui/src/charts/GrowthChart.tsx`, `apps/web/app/(app)/patients/[id]/growth/charts/`
- **Critérios de aceite:** Dado um paciente com 5 medidas, quando abrir as curvas, então vê os 5 pontos ligados sobre as linhas de referência do sexo correto, e trocar o indicador não recarrega a página.
- **Testes:** unidade (geração das linhas), e2e (visualização).

### RN-108 — Alertas de crescimento
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-106
- **Descrição:** Gerar alertas ao gravar uma medida e mostrá-los no painel da organização.
- **Tarefas técnicas:**
  - [ ] Função `detectGrowthAlerts(previous, current)` no `nutrition-core`
  - [ ] Gravação em `growth_alerts` na mesma transação da medida
  - [ ] Painel `/app/alerts/growth` com filtro e "ciente"
  - [ ] Notificação opcional por e-mail via n8n
- **Arquivos/áreas:** `packages/nutrition-core/src/pediatrics/alerts.ts`, `apps/web/app/(app)/alerts/growth/`, `n8n/workflows/growth-alerts.json`
- **Critérios de aceite:** Dado um paciente cujo z de IMC/idade passou de +0,8 para +1,3, quando a medida é gravada, então surge um alerta `band_crossing` e o nutricionista pode marcá-lo como ciente.
- **Testes:** unidade (regras), integração (gravação), RLS.

### RN-109 — Relatório de crescimento em PDF
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-107, RN-036
- **Descrição:** PDF com dados do paciente, tabela de medidas, curvas e classificação, com a marca do profissional.
- **Tarefas técnicas:**
  - [ ] Template do relatório reaproveitando o gerador de PDF
  - [ ] Renderização das curvas em SVG no servidor
  - [ ] Rodapé com nome, CRN e referências usadas (OMS, SISVAN)
- **Arquivos/áreas:** `apps/web/lib/pdf/growth-report.tsx`
- **Critérios de aceite:** Dado um paciente com medidas, quando gerar o relatório, então o PDF tem as curvas selecionadas, a classificação atual e as referências.
- **Testes:** integração (snapshot do PDF gerado).

### RN-110 — Migração de gestação e lactação
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-101
- **Descrição:** Criar `pregnancy_records`, `pregnancy_weight_logs`, `pregnancy_gain_references` e `lactation_records` com RLS.
- **Tarefas técnicas:**
  - [ ] Migração e políticas RLS
  - [ ] Restrição: no máximo uma gestação `active` por paciente
  - [ ] Auditoria nas tabelas
- **Arquivos/áreas:** `supabase/migrations/`, `packages/db`
- **Critérios de aceite:** Dada uma paciente com gestação ativa, quando tentar criar outra ativa, então o banco recusa.
- **Testes:** RLS, integração.

### RN-111 — `nutrition-core`: ganho de peso gestacional
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-110
- **Descrição:** Calcular IMC pré-gestacional, idade gestacional, faixa esperada por semana e situação do ganho.
- **Tarefas técnicas:**
  - [ ] `gestationalAge(lmp, date)` e `dueDate(lmp)` (Naegele)
  - [ ] Faixas de Kac 2021 e IOM 2009 como referências selecionáveis
  - [ ] `expectedGainRange(bmiCategory, week, reference)`
  - [ ] `classifyGain(gain, range)` → `below | adequate | above`
  - [ ] Validar valores e formato das curvas com a nutricionista RT (A validar)
- **Arquivos/áreas:** `packages/nutrition-core/src/pregnancy/`, `supabase/seed/pregnancy/`
- **Critérios de aceite:** Dada uma gestante eutrófica (IMC 22) na 40ª semana com ganho de 10 kg, quando classificar pela referência Kac 2021, então retorna "adequado".
- **Testes:** unidade (cada categoria de IMC e semanas limite).

### RN-112 — Tela de acompanhamento da gestante
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-111
- **Descrição:** Cadastro da gestação, registros de peso e gráfico do ganho com a faixa esperada.
- **Tarefas técnicas:**
  - [ ] Formulário da gestação (DUM ou IG por ultrassom, peso pré-gestacional, altura, nº de fetos)
  - [ ] Registro de peso por consulta
  - [ ] Gráfico com faixa sombreada e pontos coloridos pela situação
  - [ ] Aviso para gestação gemelar sem cálculo automático
  - [ ] Encerrar gestação (parto) e sugerir abrir registro de lactação
- **Arquivos/áreas:** `apps/web/app/(app)/patients/[id]/pregnancy/`, `packages/ui/src/charts/PregnancyGainChart.tsx`
- **Critérios de aceite:** Dada uma gestação ativa, quando o nutricionista registra o peso, então o gráfico mostra o novo ponto e a situação (abaixo, adequado, acima).
- **Testes:** e2e.

### RN-113 — Adicional energético na gestação e lactação
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-030, RN-111
- **Descrição:** Pré-preencher o adicional energético na tela de cálculo de GET conforme o trimestre ou o período de lactação.
- **Tarefas técnicas:**
  - [ ] `pregnancyEnergyAddition(week)` e `lactationEnergyAddition(monthsPostpartum)`
  - [ ] Campo editável na tela de GET, com a referência exibida
  - [ ] Revisar contra as DRIs de 2023 (A validar)
- **Arquivos/áreas:** `packages/nutrition-core/src/energy/`, tela de cálculo energético
- **Critérios de aceite:** Dada uma gestante na 30ª semana, quando abrir o cálculo de GET, então o campo de adicional vem com +452 kcal e pode ser alterado.
- **Testes:** unidade.

### RN-114 — Registro de lactação
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-110
- **Descrição:** Registrar o período e o tipo de aleitamento, com vínculo opcional ao bebê como paciente.
- **Tarefas técnicas:**
  - [ ] CRUD de `lactation_records`
  - [ ] Vínculo mãe e bebê na linha do tempo dos dois prontuários
- **Arquivos/áreas:** `apps/web/app/(app)/patients/[id]/lactation/`
- **Critérios de aceite:** Dada uma puérpera e seu bebê cadastrados, quando registrar aleitamento exclusivo, então o registro aparece nos dois prontuários.
- **Testes:** e2e, RLS.

### RN-115 — Conteúdos de introdução alimentar
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-101
- **Descrição:** Biblioteca de conteúdos por idade e método (tradicional, BLW, participativa), com fonte citada.
- **Tarefas técnicas:**
  - [ ] Migração `feeding_intro_contents`
  - [ ] Seed com 10 a 15 conteúdos baseados no Guia Alimentar para menores de 2 anos
  - [ ] Editor Markdown para a organização criar ou adaptar conteúdos
  - [ ] Fluxo de revisão e publicação pela nutricionista RT
- **Arquivos/áreas:** `supabase/migrations/`, `supabase/seed/feeding-intro/`, `apps/web/app/(app)/settings/content/feeding-intro/`
- **Critérios de aceite:** Dado um conteúdo não publicado, quando o responsável abrir o app, então não o vê; quando o nutricionista publica, então passa a vê-lo.
- **Testes:** RLS, e2e.

### RN-116 — Checklist de alergênicos e texturas
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-115
- **Descrição:** Acompanhar alimentos alergênicos introduzidos, reações e progressão de textura por idade.
- **Tarefas técnicas:**
  - [ ] Migração `feeding_intro_progress`
  - [ ] Lista de alergênicos e etapas de textura com idade de referência
  - [ ] Registro de reação com destaque para `moderate` e `severe` (gera alerta ao nutricionista)
  - [ ] Visão do nutricionista e do responsável
- **Arquivos/áreas:** `apps/web/app/(app)/patients/[id]/feeding-intro/`, `apps/web/app/(patient)/p/feeding-intro/`
- **Critérios de aceite:** Dado um bebê de 7 meses, quando o responsável registra ovo com reação moderada, então o nutricionista recebe um alerta e o item fica destacado no prontuário.
- **Testes:** e2e, RLS (responsável só escreve no próprio dependente).

### RN-117 — Visão do responsável no app do paciente
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-107, RN-116, RN-118
- **Descrição:** Exibir no PWA as curvas, os conteúdos e o checklist da criança para o responsável.
- **Tarefas técnicas:**
  - [ ] Seletor de dependente quando o usuário for responsável por mais de uma criança
  - [ ] Curvas em modo leitura, com linguagem simples e sem o z
  - [ ] Controle por paciente do que fica visível
- **Arquivos/áreas:** `apps/web/app/(patient)/p/growth/`, `apps/web/app/(patient)/p/feeding-intro/`
- **Critérios de aceite:** Dado um responsável com dois filhos pacientes, quando abrir o app, então escolhe o filho e vê só o que o nutricionista liberou.
- **Testes:** e2e, RLS.

### RN-118 — Responsáveis legais
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-101, RN-070
- **Descrição:** Cadastrar responsáveis, convidar para o app e registrar o consentimento em nome do menor.
- **Tarefas técnicas:**
  - [ ] Migração `patient_guardians` e função `is_guardian_of`
  - [ ] Convite por magic link
  - [ ] Consentimento LGPD pelo responsável (art. 14 da LGPD: consentimento específico de ao menos um dos pais ou responsável legal)
  - [ ] Ajuste das políticas RLS do app do paciente
- **Arquivos/áreas:** `supabase/migrations/`, `apps/web/app/(app)/patients/[id]/guardians/`
- **Critérios de aceite:** Dado um paciente menor sem consentimento do responsável, quando o nutricionista tentar liberar o app, então o sistema exige o consentimento antes.
- **Testes:** RLS, e2e.

### RN-119 — Validação clínica e testes e2e da fase
- **Tipo:** doc
- **Pontos:** 3
- **Depende de:** RN-100 a RN-118
- **Descrição:** Sessão de validação com a nutricionista RT, testes ponta a ponta e documentação.
- **Tarefas técnicas:**
  - [ ] Roteiro de validação com 10 casos reais anonimizados (crianças, adolescentes, gestantes)
  - [ ] Comparação dos resultados com o WHO Anthro / AnthroPlus
  - [ ] Suíte e2e: criança, adolescente, prematuro, gestante, responsável
  - [ ] Atualizar `docs/02-modulos.md` e o guia do usuário
- **Arquivos/áreas:** `apps/web/e2e/`, `docs/`
- **Critérios de aceite:** Dado o roteiro, quando a nutricionista RT revisar os 10 casos, então todas as classificações batem com as ferramentas oficiais e ela assina a validação.
- **Testes:** e2e.

## Sequência semanal

| Semana | Itens |
|---|---|
| 1 | RN-100, RN-101, RN-102, RN-103, RN-104 |
| 2 | RN-105, RN-106, RN-107, RN-108 |
| 3 | RN-109, RN-110, RN-111, RN-112, RN-113, RN-114 |
| 4 | RN-115, RN-116, RN-118, RN-117, RN-119 |

## Critério de pronto da fase

- Escore-z de todos os indicadores com diferença ≤ 0,01 em relação ao WHO Anthro nos casos de referência.
- Classificação SISVAN/OMS validada e assinada pela nutricionista RT.
- Gestante acompanhada do cadastro ao parto, com gráfico de ganho de peso.
- Responsável vê curvas e conteúdos no app, respeitando RLS e consentimento.
- Todos os itens "A validar" desta fase resolvidos ou registrados como pendência com dono e data.

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Erro de interpolação ou de correção em extremos | Classificação errada de criança | Casos de referência do WHO Anthro, testes de fronteira, revisão por pares |
| Ponto de corte desatualizado | Orientação incorreta | Tabela versionada, validação pela RT, `cutoff_version` gravado em cada medida |
| Divergência entre Kac 2021 e IOM 2009 | Confusão do profissional | Referência selecionável por gestação, padrão Kac e referência exibida no gráfico |
| Conteúdo de introdução alimentar desatualizado | Risco à criança | Fonte obrigatória em cada conteúdo, revisão anual e publicação só após revisão |
| Dados de menores de idade (LGPD art. 14) | Jurídico | Consentimento do responsável obrigatório e auditoria de acesso |

## Métricas a acompanhar

- Nº de pacientes pediátricos e gestantes ativos por organização.
- % de medidas pediátricas com classificação diferente de adequado/eutrofia (sinaliza uso clínico real).
- Tempo médio entre um alerta e o "ciente" do nutricionista.
- % de responsáveis que acessam o app ao menos uma vez por mês.
- Nº de divergências reportadas nas classificações (meta: zero).
