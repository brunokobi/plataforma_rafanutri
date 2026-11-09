# Fase 1 — MVP Clínico

## Objetivo

Permitir que o nutricionista conduza uma consulta completa dentro da Rafanutri: cadastrar o paciente, agendar, aplicar anamnese, registrar a avaliação antropométrica, calcular o gasto energético, montar o plano alimentar com cálculo de nutrientes e substituições, e entregar o plano em PDF com a sua marca. Ao final da fase, abrir o **beta fechado** com 5 a 10 nutricionistas.

## Escopo / Fora de escopo

**Escopo**
- Pacientes, consentimento LGPD, agenda e prontuário.
- Anamnese com modelos e editor de questionário; link público para o paciente responder.
- Antropometria e composição corporal com protocolos validados.
- Gasto energético, metas de macro e micronutrientes.
- Editor de plano alimentar com cálculo em tempo real, medidas caseiras, substituições e modelos.
- Base própria de alimentos e preparações do consultório.
- PDF do plano e envio por e-mail.
- Painel inicial e preparação do beta.

**Fora de escopo**
- Lembretes automáticos por WhatsApp, financeiro e cobrança (Fase 2).
- Login e app do paciente (Fase 3); nesta fase o paciente só responde anamnese por link e recebe o PDF.
- IA (Fase 3).
- Exames laboratoriais, suplementação e somatotipo (Fase 6).

## Pré-requisitos

RN-004 a RN-011, RN-013, RN-014 e RN-015 concluídos. Modelos de anamnese, protocolos e textos padrão validados pela nutricionista na primeira semana.

## Modelo de dados

```sql
create type patient_status as enum ('active', 'inactive', 'archived');
create type sex_at_birth as enum ('female', 'male');
create type appointment_status as enum ('scheduled', 'confirmed', 'done', 'no_show', 'cancelled');
create type appointment_type as enum ('first', 'return', 'other');
create type appointment_mode as enum ('in_person', 'online');

create table patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  responsible_nutritionist_id uuid references profiles(id),
  full_name text not null,
  social_name text,
  birth_date date not null,
  sex sex_at_birth not null,              -- usado nas equações
  gender_identity text,
  email citext,
  phone text,                             -- E.164
  cpf text,                               -- opcional, validado
  occupation text,
  address jsonb,
  tags text[] not null default '{}',
  status patient_status not null default 'active',
  auth_user_id uuid references auth.users(id),  -- Fase 3
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on patients (organization_id, status);
create index on patients using gin (full_name gin_trgm_ops);
create unique index on patients (organization_id, cpf) where cpf is not null;

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null,
  channel text not null,                  -- in_person | link | app
  ip inet,
  evidence_path text,                     -- termo assinado digitalizado (opcional)
  revoked_at timestamptz
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  nutritionist_id uuid not null references profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  type appointment_type not null,
  mode appointment_mode not null,
  status appointment_status not null default 'scheduled',
  meeting_url text,
  location text,
  notes text,                             -- observação administrativa (não clínica)
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ends_after_start check (ends_at > starts_at)
);
create index on appointments (organization_id, starts_at);
create index on appointments (nutritionist_id, starts_at);
-- Evitar sobreposição do mesmo nutricionista (exceto canceladas)
-- exclude using gist (nutritionist_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled')

create table clinical_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid references appointments(id),
  author_id uuid not null references profiles(id),
  content text not null,                  -- markdown simples
  signed_at timestamptz,                  -- após assinar, não pode mais ser editada
  supersedes_id uuid references clinical_notes(id),  -- retificação gera nova versão
  created_at timestamptz not null default now()
);

create table questionnaire_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),   -- null = modelo padrão da plataforma
  name text not null,
  description text,
  schema jsonb not null,                  -- ver "Formato do questionário"
  version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table anamneses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  template_id uuid not null references questionnaire_templates(id),
  template_version int not null,
  schema_snapshot jsonb not null,         -- cópia do schema no envio
  answers jsonb not null default '{}',
  status text not null default 'draft',   -- draft | sent | answered | reviewed
  public_token_hash text unique,
  token_expires_at timestamptz,
  answered_at timestamptz,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table anthropometric_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid references appointments(id),
  assessed_at date not null,
  age_years numeric(5,2) not null,        -- idade na data, para histórico estável
  weight_kg numeric(6,2),
  height_cm numeric(5,1),
  circumferences jsonb not null default '{}',   -- {waist, hip, arm, calf, neck, abdomen, thigh...} em cm
  skinfolds jsonb not null default '{}',        -- {triceps, biceps, subscapular, suprailiac, abdominal, chest, midaxillary, thigh, calf} em mm
  bioimpedance jsonb,                           -- valores digitados do aparelho
  protocol text,                                -- ex.: 'jp3', 'jp7', 'durnin_womersley', 'faulkner'
  density_equation text,                        -- 'siri' | 'brozek'
  results jsonb not null default '{}',          -- calculados pelo nutrition-core
  calc_version text not null,                   -- versão do nutrition-core
  notes text,
  author_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index on anthropometric_assessments (patient_id, assessed_at desc);

create table energy_calculations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  assessment_id uuid references anthropometric_assessments(id),
  formula text not null,                  -- harris_benedict_1919 | mifflin_st_jeor | cunningham | fao_who_1985 | manual
  inputs jsonb not null,                  -- peso usado, altura, idade, sexo, massa magra
  activity_factor numeric(4,2) not null,
  ree_kcal numeric(7,1) not null,         -- gasto energético de repouso
  tee_kcal numeric(7,1) not null,         -- gasto energético total
  adjustment_kcal numeric(7,1) not null default 0,   -- déficit/superávit
  target_kcal numeric(7,1) not null,
  macro_targets jsonb not null,           -- {protein: {g_per_kg|pct|g}, carbohydrate, lipid}
  micro_targets jsonb,                    -- metas de micronutrientes escolhidas
  calc_version text not null,
  author_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- Alimentos próprios usam a tabela foods (organization_id preenchido).
-- Preparações do consultório:
create table recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  yield_g numeric(8,1) not null,          -- peso final da preparação pronta
  servings numeric(6,1),
  instructions text,
  created_at timestamptz not null default now()
);
create table recipe_items (
  recipe_id uuid not null references recipes(id) on delete cascade,
  food_id uuid not null references foods(id),
  quantity_g numeric(8,1) not null,
  position smallint not null,
  primary key (recipe_id, position)
);

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid references patients(id) on delete cascade,  -- null quando is_template
  energy_calculation_id uuid references energy_calculations(id),
  title text not null,
  status text not null default 'draft',   -- draft | published | archived
  is_template boolean not null default false,
  general_guidelines text,                -- orientações gerais
  valid_from date,
  valid_until date,
  published_at timestamptz,
  published_snapshot jsonb,               -- totais e itens no momento da publicação
  author_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  name text not null,                     -- Café da manhã, Lanche...
  time time,
  position smallint not null,
  notes text
);

create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  food_id uuid references foods(id),
  recipe_id uuid references recipes(id),
  quantity_g numeric(8,1) not null,
  household_measure_label text,
  household_measure_qty numeric(6,2),
  position smallint not null,
  notes text,
  constraint food_or_recipe check ((food_id is null) <> (recipe_id is null))
);

create table meal_item_substitutions (
  id uuid primary key default gen_random_uuid(),
  meal_item_id uuid not null references meal_items(id) on delete cascade,
  food_id uuid references foods(id),
  recipe_id uuid references recipes(id),
  quantity_g numeric(8,1) not null,
  household_measure_label text,
  household_measure_qty numeric(6,2),
  position smallint not null
);

create table text_snippets (                -- orientações reutilizáveis
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  category text not null,                 -- hidratacao, intestino, treino...
  title text not null,
  body text not null
);
```

### RLS desta fase

| Tabela | `owner` / `nutritionist` | `assistant` | Observação |
|---|---|---|---|
| `patients` | leitura/escrita na organização | leitura/escrita só de dados cadastrais (view `patients_admin` sem campos clínicos) | `nutritionist` vê todos os pacientes da organização no MVP; restringir ao responsável é configuração futura |
| `consent_records` | leitura/escrita | leitura | Sem update/delete, só revogação |
| `appointments` | leitura/escrita | leitura/escrita | |
| `clinical_notes` | leitura; escrita do autor; sem update após `signed_at` | sem acesso | Retificação cria nova linha |
| `anamneses`, `anthropometric_assessments`, `energy_calculations`, `meal_plans`, `meals`, `meal_items`, `meal_item_substitutions` | leitura/escrita | sem acesso | Tabelas filhas checam a organização pelo pai |
| `questionnaire_templates` | leitura dos padrões e da organização; escrita da organização | sem acesso | |
| `recipes`, `recipe_items`, `text_snippets` | leitura/escrita | sem acesso | |

Todas as tabelas clínicas recebem o gatilho de auditoria (RN-009).

### Formato do questionário (`schema jsonb`)

```json
{
  "sections": [
    {
      "id": "habitos",
      "title": "Hábitos",
      "questions": [
        { "id": "agua", "type": "number", "label": "Quantos copos de água por dia?", "unit": "copos", "required": true },
        { "id": "intestino", "type": "single_choice", "label": "Funcionamento intestinal",
          "options": ["Diário", "A cada 2-3 dias", "Menos frequente"] },
        { "id": "alergia", "type": "boolean", "label": "Possui alergia alimentar?" },
        { "id": "alergia_quais", "type": "text", "label": "Quais?",
          "show_if": { "question": "alergia", "equals": true } }
      ]
    }
  ]
}
```

Tipos suportados: `text`, `long_text`, `number`, `boolean`, `single_choice`, `multi_choice`, `scale` (0 a 10), `date`, `food_list`, `meal_recall` (recordatório por refeição). Validação por Zod gerado a partir do schema.

## Regras de cálculo

Todas as fórmulas vivem em `packages/nutrition-core`, como funções puras, com testes que reproduzem exemplos publicados. A nutricionista valida cada fórmula antes do merge. Valores marcados "A validar" precisam de conferência na fonte original.

### Antropometria

| Cálculo | Fórmula | Referência |
|---|---|---|
| IMC | peso (kg) / altura (m)² | OMS |
| Classificação IMC adulto | < 18,5 baixo peso; 18,5–24,9 eutrofia; 25–29,9 sobrepeso; 30–34,9 obesidade I; 35–39,9 obesidade II; ≥ 40 obesidade III | OMS, 2000 |
| Classificação IMC idoso (≥ 60 anos) | < 22 baixo peso; 22–27 eutrofia; > 27 sobrepeso | Lipschitz, 1994 |
| Circunferência da cintura (risco) | Homens: ≥ 94 aumentado, ≥ 102 muito aumentado. Mulheres: ≥ 80 aumentado, ≥ 88 muito aumentado | OMS, 2000 |
| Relação cintura/quadril | cintura / quadril | OMS |
| Relação cintura/estatura | cintura / estatura (alerta a partir de 0,5) | Ashwell |
| Peso ajustado | (peso atual − peso ideal) × 0,25 + peso ideal | Prática clínica — A validar fator |

### Composição corporal

| Protocolo | Dobras | Equação de densidade corporal (DC) |
|---|---|---|
| Jackson & Pollock 3 (homens, 1978) | peitoral, abdominal, coxa | DC = 1,10938 − 0,0008267·S + 0,0000016·S² − 0,0002574·idade |
| Jackson, Pollock & Ward 3 (mulheres, 1980) | tríceps, suprailíaca, coxa | DC = 1,0994921 − 0,0009929·S + 0,0000023·S² − 0,0001392·idade |
| Jackson & Pollock 7 (homens) | peitoral, axilar média, tríceps, subescapular, abdominal, suprailíaca, coxa | DC = 1,112 − 0,00043499·S + 0,00000055·S² − 0,00028826·idade |
| Jackson, Pollock & Ward 7 (mulheres) | mesmas 7 | DC = 1,097 − 0,00046971·S + 0,00000056·S² − 0,00012828·idade |
| Durnin & Womersley (1974) | bíceps, tríceps, subescapular, suprailíaca | DC = c − m·log10(S), coeficientes c e m por sexo e faixa etária — implementar a tabela original (A validar) |
| Faulkner (1968) | tríceps, subescapular, suprailíaca, abdominal | %G = 0,153·S + 5,783 (direto, sem DC) |

Conversão de densidade em % de gordura:
- Siri (1961): %G = (4,95 / DC − 4,50) × 100
- Brozek (1963): %G = (4,57 / DC − 4,142) × 100

Derivados: massa gorda (kg) = peso × %G / 100; massa magra (kg) = peso − massa gorda.

O resultado guarda protocolo, equação de conversão e `calc_version`, para que o histórico não mude se a implementação evoluir.

### Gasto energético

P = peso (kg), A = altura (cm), I = idade (anos), MLG = massa livre de gordura (kg).

| Fórmula | Homens | Mulheres |
|---|---|---|
| Harris-Benedict (1919) | 66,47 + 13,75·P + 5,003·A − 6,755·I | 655,1 + 9,563·P + 1,850·A − 4,676·I |
| Mifflin-St Jeor (1990) | 10·P + 6,25·A − 5·I + 5 | 10·P + 6,25·A − 5·I − 161 |
| Cunningham (1980) | 500 + 22·MLG | 500 + 22·MLG |
| FAO/OMS (1985), 18–30 anos | 15,3·P + 679 | 14,7·P + 496 |
| FAO/OMS (1985), 30–60 anos | 11,6·P + 879 | 8,7·P + 829 |
| FAO/OMS (1985), > 60 anos | 13,5·P + 487 | 10,5·P + 596 |

- GET = GER × fator de atividade. Tabela de fatores configurável, com valores padrão escolhidos pela nutricionista (A validar a fonte adotada).
- Meta = GET + ajuste (déficit ou superávit em kcal).
- Cunningham exige massa magra de uma avaliação; se não houver, a opção fica desabilitada.
- Equações específicas para crianças e adolescentes (ex.: DRI/IOM 2005) ficam para a Fase 4.

### Macronutrientes e plano

- Energia dos macros: proteína e carboidrato 4 kcal/g; lipídio 9 kcal/g; álcool 7 kcal/g.
- Metas de macro podem ser definidas em g/kg de peso, em % do valor energético ou em gramas; a interface converte entre as três.
- Nutriente de um item = `amount_per_100g × quantity_g / 100`. Preparações: soma dos ingredientes normalizada pelo rendimento (`yield_g`).
- Alimento sem valor para um nutriente (`null`) entra como "dado ausente" e o total mostra um aviso, em vez de contar como zero.
- Adequação = total / meta × 100, com faixas visuais (abaixo de 90%, 90–110%, acima de 110%), configuráveis.
- Metas de micronutrientes: padrão a partir das DRIs (IOM) por sexo e faixa etária, editáveis pelo profissional (A validar tabela e versão adotadas).

### Substituição por equivalência

1. O nutricionista escolhe o critério: energia, ou o macronutriente principal do item (proteína, carboidrato ou lipídio).
2. Quantidade do substituto = quantidade original × (valor do critério no original por 100 g ÷ valor no substituto por 100 g).
3. A quantidade é arredondada para a medida caseira mais próxima do substituto, e a diferença resultante (em kcal e no macro) é exibida.
4. Sugestões automáticas vêm do mesmo grupo alimentar, ordenadas pela menor diferença nos outros macros.

## Rotas e telas

| Rota | Tela | Acesso |
|---|---|---|
| `/[orgSlug]` | Painel: consultas do dia, anamneses respondidas a revisar, aniversariantes, atalhos | Membro (conteúdo por papel) |
| `/[orgSlug]/pacientes` | Lista com busca, filtros (status, tags, responsável) e paginação | Membro |
| `/[orgSlug]/pacientes/novo` | Cadastro com consentimento | Membro |
| `/[orgSlug]/pacientes/[id]` | Ficha resumo: dados, última avaliação, plano vigente, próximas consultas, linha do tempo | `owner`, `nutritionist` (assistente vê só dados cadastrais e agenda) |
| `/[orgSlug]/pacientes/[id]/anamneses` | Lista e envio de anamneses | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/anamneses/[aid]` | Respostas e revisão | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/avaliacoes` | Histórico e gráficos | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/avaliacoes/nova` | Formulário de avaliação | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/energia` | Cálculo de gasto energético e metas | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/planos` | Planos do paciente | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/planos/[pid]` | Editor de plano alimentar | `owner`, `nutritionist` |
| `/[orgSlug]/pacientes/[id]/prontuario` | Evoluções | `owner`, `nutritionist` |
| `/[orgSlug]/agenda` | Agenda dia/semana/lista | Membro |
| `/[orgSlug]/modelos/questionarios` | Modelos de anamnese e editor | `owner`, `nutritionist` |
| `/[orgSlug]/modelos/planos` | Modelos de plano | `owner`, `nutritionist` |
| `/[orgSlug]/modelos/textos` | Orientações reutilizáveis | `owner`, `nutritionist` |
| `/[orgSlug]/alimentos` | Base de alimentos, alimentos próprios e preparações | `owner`, `nutritionist` |
| `/r/[token]` | Formulário público de anamnese para o paciente | Público com token |

## Itens do backlog

### RN-020 — Pacientes: cadastro, busca e filtros
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-008, RN-013
- **Descrição:** CRUD de pacientes com validação, busca por nome, filtros e arquivamento.
- **Tarefas técnicas:**
  - [ ] Migração `patients` com RLS, view `patients_admin` para o assistente e gatilho de auditoria
  - [ ] Schemas Zod compartilhados (CPF com dígito verificador, telefone E.164, data de nascimento não futura)
  - [ ] Lista com busca por trigrama, filtros, ordenação e paginação por cursor
  - [ ] Formulário de criação/edição; campos opcionais recolhidos
  - [ ] Arquivar e reativar (sem exclusão física nesta fase)
  - [ ] Detecção de possível duplicidade (mesmo nome + data de nascimento ou mesmo CPF)
  - [ ] Cálculo de idade exibido a partir de `birth_date`
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/pacientes`, `packages/db`
- **Critérios de aceite:**
  - Dado um paciente com CPF já cadastrado na organização, quando tento salvar outro com o mesmo CPF, então recebo erro claro.
  - Quando busco por parte do nome sem acento, então o paciente aparece.
  - Dado um `assistant`, quando abre o paciente, então não vê nenhum dado clínico.
- **Testes:** unidade dos validadores; pgTAP de RLS (isolamento e assistente); e2e de cadastro e busca.

### RN-021 — Consentimento LGPD do paciente
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-016, RN-020
- **Descrição:** registrar consentimento no cadastro (presencial) ou no formulário público (link), com versão do termo.
- **Tarefas técnicas:**
  - [ ] Migração `consent_records`
  - [ ] Passo obrigatório de consentimento no cadastro, com opção de anexar termo assinado
  - [ ] Aceite no formulário público de anamnese (RN-026) com IP e data
  - [ ] Revogação: registra `revoked_at`, bloqueia novos envios ao paciente e exibe alerta na ficha
  - [ ] Exportação dos dados do paciente (JSON e PDF) para atender pedido do titular
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/pacientes`
- **Critérios de aceite:**
  - Dado um paciente sem consentimento, quando tento enviar anamnese, então o sistema pede o consentimento antes.
  - Quando exporto os dados do paciente, então recebo arquivo com cadastro, avaliações, planos e anamneses, e a ação fica registrada em `audit_logs`.
- **Testes:** pgTAP; e2e de revogação e exportação.

### RN-022 — Agenda
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-020
- **Descrição:** agenda por nutricionista com visões dia, semana e lista; criar, remarcar, confirmar, cancelar e marcar falta.
- **Tarefas técnicas:**
  - [ ] Migração `appointments` com restrição de sobreposição (`btree_gist`)
  - [ ] Configuração de expediente por nutricionista (dias, horários, duração padrão de primeira consulta e retorno)
  - [ ] Componente de calendário (avaliar FullCalendar ou implementação própria) com arrastar para remarcar
  - [ ] Criação rápida a partir de um horário livre; busca/cadastro rápido de paciente no modal
  - [ ] Filtro por nutricionista (clínicas)
  - [ ] Fuso horário fixo da organização (`America/Sao_Paulo` padrão)
  - [ ] Link de reunião para consultas online (campo livre nesta fase)
  - [ ] Ao concluir consulta, atalho para "iniciar atendimento" (abre a ficha do paciente)
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/agenda`, `packages/ui`
- **Critérios de aceite:**
  - Dado um horário ocupado, quando tento marcar outra consulta sobreposta para o mesmo nutricionista, então recebo erro.
  - Quando arrasto uma consulta para outro horário livre, então ela é remarcada e o histórico registra a alteração.
  - Na visão de celular, a agenda do dia é legível e permite criar consulta.
- **Testes:** pgTAP da restrição; unidade de cálculo de horários livres; e2e de criar/remarcar/cancelar.

### RN-023 — Prontuário: linha do tempo e evolução
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-020, RN-009
- **Descrição:** registro da evolução por atendimento, com autoria (nome e CRN), assinatura e retificação sem apagar o original.
- **Tarefas técnicas:**
  - [ ] Migração `clinical_notes` com política que impede update após `signed_at`
  - [ ] Editor de texto simples (markdown com barra de formatação) e inserção de textos padrão
  - [ ] Linha do tempo agregando: consultas, anamneses, avaliações, cálculos, planos publicados e evoluções
  - [ ] Assinar evolução (marca `signed_at`, exibe nome e CRN do autor)
  - [ ] Retificar: cria nova versão vinculada (`supersedes_id`) e mostra o histórico
  - [ ] Registrar leitura do prontuário via `log_access`
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/pacientes/[id]/prontuario`
- **Critérios de aceite:**
  - Dado uma evolução assinada, quando tento editá-la, então só consigo retificar, e as duas versões ficam visíveis.
  - A linha do tempo mostra os eventos em ordem cronológica com filtros por tipo.
- **Testes:** pgTAP da imutabilidade; e2e de assinar e retificar.

### RN-024 — Anamnese: modelos padrão
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-025
- **Descrição:** modelos prontos validados pela nutricionista, disponíveis para todas as organizações.
- **Tarefas técnicas:**
  - [ ] Definir com a nutricionista os modelos: clínica adulto, esportiva, emagrecimento, vegetariano/vegano, recordatório 24 h, questionário de frequência alimentar simplificado
  - [ ] Seed em `questionnaire_templates` com `organization_id = null`
  - [ ] Ação "duplicar para minha organização" para customizar
- **Arquivos/áreas:** `supabase/seed`, `apps/web/app/(app)/[orgSlug]/modelos/questionarios`
- **Critérios de aceite:**
  - Uma organização nova enxerga os modelos padrão e consegue duplicar e editar uma cópia sem alterar o original.
- **Testes:** validação dos schemas no CI (todos os modelos passam no validador do RN-025).

### RN-025 — Editor de questionário customizável
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-013
- **Descrição:** criar e editar questionários com seções, tipos de pergunta, obrigatoriedade e condições de exibição.
- **Tarefas técnicas:**
  - [ ] Schema Zod do formato `schema jsonb` em `packages/db` (ou `packages/forms`)
  - [ ] Renderizador único usado no painel, no formulário público e futuramente no app
  - [ ] Editor com adicionar/reordenar (arrastar) seções e perguntas, pré-visualização ao lado
  - [ ] Condições `show_if` simples (igual a, contém)
  - [ ] Versionamento: editar modelo em uso cria nova versão; anamneses guardam `schema_snapshot`
  - [ ] Gerador de schema Zod de respostas a partir do questionário
- **Arquivos/áreas:** `packages/forms` (novo), `apps/web/app/(app)/[orgSlug]/modelos/questionarios`
- **Critérios de aceite:**
  - Dado um questionário com pergunta condicional, quando a condição não é satisfeita, então a pergunta não aparece e não é obrigatória.
  - Quando altero um modelo já enviado a pacientes, então as anamneses antigas continuam exibindo as perguntas originais.
- **Testes:** unidade do validador, do renderizador e da lógica condicional; e2e do editor.

### RN-026 — Link público de anamnese
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-021, RN-025
- **Descrição:** o nutricionista envia ao paciente um link para responder a anamnese antes da consulta, sem login.
- **Tarefas técnicas:**
  - [ ] Gerar token aleatório (32 bytes), guardar só o hash, validade configurável (padrão 7 dias)
  - [ ] Edge Function `anamnesis-public` com `GET` (retorna schema e nome do profissional, sem dados do paciente além do primeiro nome) e `POST` (salva respostas)
  - [ ] Página `/r/[token]` com a marca do profissional, salvamento parcial (rascunho) e envio final
  - [ ] Consentimento LGPD no início se ainda não houver
  - [ ] Rate limit por IP e por token; token invalidado após envio final
  - [ ] Copiar link e enviar por e-mail (WhatsApp manual por link `wa.me` nesta fase)
  - [ ] Notificação no painel quando o paciente responder
- **Arquivos/áreas:** `supabase/functions/anamnesis-public`, `apps/web/app/r/[token]`
- **Critérios de aceite:**
  - Dado um token expirado ou já usado, quando o paciente abre o link, então vê mensagem para pedir novo link.
  - Quando o paciente envia, então a anamnese muda para `answered` e aparece no painel do nutricionista.
  - A página funciona bem em celular e não expõe dados de outros pacientes.
- **Testes:** testes da Edge Function (token válido, expirado, reutilizado, payload inválido); e2e de ponta a ponta.

### RN-027 — `nutrition-core`: antropometria e composição corporal
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-001
- **Descrição:** implementar as fórmulas da seção "Regras de cálculo" com tipos fortes e testes de referência.
- **Tarefas técnicas:**
  - [ ] `bmi()`, `classifyBmi(age)`, `waistRisk()`, `waistHipRatio()`, `waistHeightRatio()`, `adjustedWeight()`
  - [ ] Protocolos: `jacksonPollock3`, `jacksonPollock7`, `durninWomersley`, `faulkner`
  - [ ] `siri()`, `brozek()`, `bodyComposition()`
  - [ ] Validação de entradas (faixas plausíveis, dobras exigidas por protocolo) com erros tipados
  - [ ] Constante `CALC_VERSION` exportada
  - [ ] Testes com casos de referência da literatura e casos-limite
- **Arquivos/áreas:** `packages/nutrition-core/src/anthropometry`, `packages/nutrition-core/src/body-composition`
- **Critérios de aceite:**
  - Cada fórmula tem ao menos 3 casos de teste conferidos pela nutricionista, com tolerância documentada.
  - Cobertura de linhas do módulo acima de 95%.
- **Testes:** unidade (Vitest).

### RN-028 — Avaliação antropométrica e gráficos de evolução
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-027, RN-020
- **Descrição:** formulário de avaliação com cálculo imediato e histórico com gráficos.
- **Tarefas técnicas:**
  - [ ] Migração `anthropometric_assessments` com RLS e auditoria
  - [ ] Formulário: peso, altura (puxa a última), circunferências, dobras (com campos conforme o protocolo escolhido; aceita até 3 medidas e usa a média ou mediana), bioimpedância (valores digitados)
  - [ ] Resultados ao vivo ao preencher (IMC, % gordura, massas, classificações)
  - [ ] Histórico em tabela com comparação entre duas avaliações (diferença absoluta e %)
  - [ ] Gráficos (Recharts): peso, IMC, % gordura, massa magra, circunferências ao longo do tempo
  - [ ] Fotos de evolução opcionais (bucket privado, URL assinada)
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/pacientes/[id]/avaliacoes`
- **Critérios de aceite:**
  - Quando preencho as dobras do protocolo escolhido, então os resultados aparecem sem salvar, e ao salvar ficam gravados com protocolo e `calc_version`.
  - Com 2 ou mais avaliações, os gráficos mostram a evolução.
- **Testes:** e2e de avaliação completa; pgTAP de RLS.

### RN-029 — `nutrition-core`: gasto energético
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-001
- **Descrição:** fórmulas de GER/GET e conversões de macronutrientes.
- **Tarefas técnicas:**
  - [ ] `harrisBenedict1919`, `mifflinStJeor`, `cunningham`, `faoWho1985`
  - [ ] `totalEnergyExpenditure(ree, activityFactor)`
  - [ ] `macroTargets()` convertendo entre g/kg, % e gramas
  - [ ] Tabela de fatores de atividade configurável
  - [ ] Testes com exemplos de referência
- **Arquivos/áreas:** `packages/nutrition-core/src/energy`
- **Critérios de aceite:**
  - Para um mesmo paciente de exemplo, os resultados batem com cálculo manual conferido pela nutricionista.
- **Testes:** unidade.

### RN-030 — Cálculo energético e metas
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-029, RN-028
- **Descrição:** tela que compara fórmulas lado a lado, permite escolher uma, definir fator de atividade, ajuste e metas de macros.
- **Tarefas técnicas:**
  - [ ] Migração `energy_calculations`
  - [ ] Preenchimento automático com a última avaliação (peso, altura, massa magra)
  - [ ] Escolha do peso usado (atual, ideal, ajustado)
  - [ ] Comparativo das fórmulas em tabela, com a escolhida em destaque
  - [ ] Metas de macros com controles vinculados (alterar g/kg atualiza % e g)
  - [ ] Metas de micronutrientes pré-preenchidas (RN-044)
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/pacientes/[id]/energia`
- **Critérios de aceite:**
  - Quando altero proteína em g/kg, então a % do valor energético e as gramas atualizam, e a soma dos macros é exibida contra a meta calórica.
- **Testes:** unidade dos conversores; e2e.

### RN-031 — Editor de plano alimentar
- **Tipo:** feature
- **Pontos:** 8
- **Depende de:** RN-030, RN-010
- **Descrição:** a principal tela do produto. Montar refeições, adicionar alimentos e preparações com busca rápida e ajustar quantidades.
- **Tarefas técnicas:**
  - [ ] Migrações `meal_plans`, `meals`, `meal_items`, `meal_item_substitutions`
  - [ ] Estrutura padrão de refeições configurável (café, lanche, almoço, lanche, jantar, ceia)
  - [ ] Busca de alimentos com teclado (atalho, setas, Enter), mostrando fonte e kcal por 100 g
  - [ ] Quantidade em gramas ou em medida caseira (conversão automática)
  - [ ] Reordenar itens e refeições (arrastar), duplicar refeição, copiar refeição de outro plano
  - [ ] Salvamento automático do rascunho com indicação de estado
  - [ ] Orientações gerais e por refeição, inserindo textos padrão
  - [ ] Publicar plano: congela `published_snapshot`, arquiva o plano anterior vigente
  - [ ] Desempenho: editor responsivo com 60+ itens
- **Arquivos/áreas:** `supabase/migrations`, `apps/web/app/(app)/[orgSlug]/pacientes/[id]/planos/[pid]`, `packages/ui`
- **Critérios de aceite:**
  - Usando apenas o teclado, consigo adicionar um alimento a uma refeição em menos de 5 segundos.
  - Ao publicar, o plano anterior vira `archived` e o novo aparece como vigente na ficha.
  - Fechar a aba e voltar não perde alterações.
- **Testes:** e2e do fluxo de montagem e publicação; pgTAP de RLS das tabelas filhas.

### RN-032 — Cálculo em tempo real de nutrientes
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-031, RN-044
- **Descrição:** totais por refeição e do dia, comparados com as metas.
- **Tarefas técnicas:**
  - [ ] `nutrition-core`: `computeItemNutrients`, `computeMealTotals`, `computePlanTotals`, `adequacy()`, tratando dados ausentes
  - [ ] Carregar composição dos alimentos do plano em lote e manter em cache no cliente
  - [ ] Painel lateral fixo: kcal, macros (g, % e g/kg), fibras e micronutrientes selecionados, com barras de adequação
  - [ ] Distribuição de calorias por refeição (gráfico)
  - [ ] Aviso quando algum alimento não tem dado de um nutriente
- **Arquivos/áreas:** `packages/nutrition-core/src/plan`, `apps/web/.../planos/[pid]`
- **Critérios de aceite:**
  - Quando altero uma quantidade, então os totais atualizam em menos de 100 ms.
  - Os totais conferem com o cálculo manual de um plano de referência montado pela nutricionista.
- **Testes:** unidade com plano de referência; teste de desempenho.

### RN-033 — Medidas caseiras
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-011
- **Descrição:** medidas caseiras por alimento (colher de sopa, xícara, unidade, fatia, concha) com gramas equivalentes.
- **Tarefas técnicas:**
  - [ ] Curadoria com a nutricionista das medidas dos 300 alimentos mais usados, com fonte (ex.: tabelas de medidas caseiras publicadas — A validar)
  - [ ] Edição de medidas por organização (sobrescreve a padrão sem alterá-la)
  - [ ] Exibição "2 colheres de sopa (50 g)" no editor e no PDF
- **Arquivos/áreas:** `supabase/seed`, `apps/web/.../alimentos`
- **Critérios de aceite:**
  - Ao escolher uma medida caseira, a quantidade em gramas é calculada, e vice-versa.
- **Testes:** unidade da conversão.

### RN-034 — Substituições por equivalência
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-032, RN-033
- **Descrição:** adicionar substitutos a um item com cálculo automático da quantidade equivalente.
- **Tarefas técnicas:**
  - [ ] `nutrition-core`: `equivalentQuantity(original, substitute, criterion)` e `suggestSubstitutes()`
  - [ ] Interface: botão "substituições" no item, sugestões do mesmo grupo e busca livre
  - [ ] Exibição da diferença de kcal e macros de cada substituto
  - [ ] Listas de substituição salvas e reutilizáveis (ex.: "carboidratos do café")
- **Arquivos/áreas:** `packages/nutrition-core/src/substitution`, `apps/web/.../planos/[pid]`
- **Critérios de aceite:**
  - Dado 100 g de arroz cozido com critério energia, quando escolho macarrão cozido, então a quantidade sugerida tem a mesma energia, arredondada para medida caseira, com a diferença exibida.
- **Testes:** unidade do algoritmo; e2e.

### RN-035 — Modelos de plano e duplicação
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-031
- **Descrição:** salvar um plano como modelo, aplicar modelo a um paciente com ajuste proporcional às calorias e duplicar planos.
- **Tarefas técnicas:**
  - [ ] Salvar como modelo (`is_template = true`, sem paciente)
  - [ ] Aplicar modelo: escolher, opção de escalar quantidades para a meta calórica do paciente
  - [ ] Duplicar plano do mesmo paciente (nova versão a partir da anterior)
  - [ ] Tela de modelos com busca e tags
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/modelos/planos`
- **Critérios de aceite:**
  - Dado um modelo de 2.000 kcal, quando aplico para meta de 1.600 kcal com escala, então as quantidades são reduzidas proporcionalmente e arredondadas.
- **Testes:** unidade da escala; e2e.

### RN-036 — PDF do plano alimentar
- **Tipo:** feature
- **Pontos:** 5
- **Depende de:** RN-031, RN-034
- **Descrição:** PDF bonito e legível com a marca do profissional.
- **Tarefas técnicas:**
  - [ ] Escolher tecnologia (React PDF ou HTML + Playwright em Edge/serverless) e registrar ADR
  - [ ] Layout: capa com logo, cor e dados do profissional (nome, CRN); refeições com horários, quantidades em medida caseira e gramas; substituições; orientações gerais
  - [ ] Opções: mostrar ou ocultar calorias e macros para o paciente
  - [ ] Rodapé com data, validade, assinatura do profissional e paginação
  - [ ] Armazenar o PDF gerado no bucket privado, vinculado à versão publicada
  - [ ] Enviar por e-mail ao paciente (com consentimento) e baixar
- **Arquivos/áreas:** `apps/web/app/api/pdf` ou `supabase/functions/meal-plan-pdf`, `packages/pdf` (novo)
- **Critérios de aceite:**
  - O PDF de um plano com 6 refeições e substituições é gerado em menos de 5 segundos e não quebra itens entre páginas de forma ilegível.
  - O paciente recebe e-mail com o PDF ou link assinado de curta validade.
- **Testes:** teste de snapshot do HTML/estrutura; e2e de geração e download.

### RN-037 — Testes e2e do fluxo completo de consulta
- **Tipo:** infra
- **Pontos:** 5
- **Depende de:** RN-020 a RN-036
- **Descrição:** cenário único que percorre a consulta de ponta a ponta, rodando no CI.
- **Tarefas técnicas:**
  - [ ] Fixtures de organização, nutricionista e paciente
  - [ ] Cenário: cadastrar paciente → agendar → enviar anamnese → responder pelo link → avaliar → calcular energia → montar plano com substituição → publicar → gerar PDF
  - [ ] Medição do tempo total do fluxo para acompanhar a meta de 10 minutos (com usuário real, em teste de usabilidade)
- **Arquivos/áreas:** `apps/web/e2e`
- **Critérios de aceite:**
  - O cenário passa no CI de forma estável (3 execuções seguidas sem falha intermitente).
- **Testes:** e2e.

### RN-038 — Seed de dados sintéticos
- **Tipo:** infra
- **Pontos:** 2
- **Depende de:** RN-020, RN-031
- **Descrição:** dados fictícios realistas para desenvolvimento, staging e demonstrações comerciais.
- **Tarefas técnicas:**
  - [ ] Script com organização demo, 3 profissionais, 30 pacientes, agenda de 4 semanas, avaliações com evolução e planos
  - [ ] Nomes e documentos gerados (CPFs válidos de teste, nenhum dado real)
  - [ ] Comando `pnpm db:seed:demo`
- **Arquivos/áreas:** `supabase/seed`, `scripts/`
- **Critérios de aceite:**
  - Um ambiente novo fica pronto para demonstração com um único comando.
- **Testes:** —

### RN-039 — Painel inicial do nutricionista
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-022, RN-026
- **Descrição:** primeira tela após o login com o que importa no dia.
- **Tarefas técnicas:**
  - [ ] Consultas de hoje com atalho para a ficha
  - [ ] Anamneses respondidas aguardando revisão
  - [ ] Pacientes sem retorno há mais de N dias (configurável)
  - [ ] Aniversariantes da semana
  - [ ] Atalhos: novo paciente, nova consulta, novo plano
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/page.tsx`
- **Critérios de aceite:**
  - O painel carrega em menos de 1,5 s no staging com a base demo.
- **Testes:** e2e.

### RN-040 — Ficha resumo do paciente
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-023, RN-028, RN-031
- **Descrição:** visão de uma página com o essencial antes da consulta.
- **Tarefas técnicas:**
  - [ ] Cabeçalho com idade, objetivo, alergias e restrições (vindas da anamnese revisada)
  - [ ] Cartões: última avaliação com variação, plano vigente com kcal, próxima consulta, última evolução
  - [ ] Abas para as seções detalhadas
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/pacientes/[id]`
- **Critérios de aceite:**
  - Alergias registradas na anamnese aparecem em destaque na ficha e no editor de plano.
- **Testes:** e2e.

### RN-041 — Alimentos próprios do consultório
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-010
- **Descrição:** cadastrar alimentos que não estão nas bases (ex.: produtos industrializados a partir do rótulo).
- **Tarefas técnicas:**
  - [ ] Formulário com composição por 100 g ou por porção do rótulo (conversão para 100 g)
  - [ ] Medidas caseiras do alimento
  - [ ] Identificação visual de "alimento próprio" nas buscas
  - [ ] Duplicar alimento da TACO para ajustar
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/alimentos`
- **Critérios de aceite:**
  - Dado um rótulo com porção de 30 g, quando informo os valores da porção, então o sistema grava os valores por 100 g corretamente.
- **Testes:** unidade da conversão; pgTAP (alimento próprio invisível para outras organizações).

### RN-042 — Preparações do consultório
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-041
- **Descrição:** receitas compostas por ingredientes, com rendimento, usadas como item no plano.
- **Tarefas técnicas:**
  - [ ] Migrações `recipes` e `recipe_items`
  - [ ] Cálculo da composição por 100 g da preparação pronta (`nutrition-core`)
  - [ ] Modo de preparo exibido no PDF quando a preparação estiver no plano
- **Arquivos/áreas:** `supabase/migrations`, `packages/nutrition-core/src/recipe`, `apps/web/.../alimentos/preparacoes`
- **Critérios de aceite:**
  - Uma preparação com 4 ingredientes e rendimento informado aparece na busca com kcal por 100 g calculada.
- **Testes:** unidade.

### RN-043 — Avaliação do consumo alimentar atual
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-025, RN-032
- **Descrição:** calcular o recordatório 24 h (pergunta tipo `meal_recall`) com a base de alimentos para comparar consumo atual e metas.
- **Tarefas técnicas:**
  - [ ] No recordatório, permitir vincular cada item informado pelo paciente a um alimento da base
  - [ ] Totais de energia e nutrientes do consumo atual
  - [ ] Comparativo consumo atual × metas × plano proposto
- **Arquivos/áreas:** `apps/web/.../anamneses/[aid]`, `packages/nutrition-core`
- **Critérios de aceite:**
  - Após vincular os itens, vejo o total calórico do recordatório e a comparação com a meta.
- **Testes:** e2e.

### RN-044 — Metas de micronutrientes de referência
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-010
- **Descrição:** tabela de referência de ingestão por sexo e faixa etária para pré-preencher metas.
- **Tarefas técnicas:**
  - [ ] Definir com a nutricionista a fonte (DRIs/IOM, versão) e os nutrientes exibidos (A validar)
  - [ ] Tabela `nutrient_references (nutrient_id, sex, age_min, age_max, life_stage, rda, ai, ul)` com seed
  - [ ] Função `referenceTargets(sex, age, lifeStage)` no `nutrition-core`
  - [ ] Alerta quando o plano ultrapassa o limite superior tolerável (UL)
- **Arquivos/áreas:** `supabase/migrations`, `supabase/seed`, `packages/nutrition-core/src/references`
- **Critérios de aceite:**
  - Para mulher de 30 anos, as metas de cálcio e ferro são preenchidas conforme a tabela adotada.
- **Testes:** unidade.

### RN-045 — Orientações e textos reutilizáveis
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-031
- **Descrição:** biblioteca de orientações (hidratação, mastigação, intestino, treino) para inserir no plano e no prontuário.
- **Tarefas técnicas:**
  - [ ] Migração `text_snippets`; seed com textos padrão escritos pela nutricionista
  - [ ] Tela de gestão por categoria
  - [ ] Inserção rápida por `/` no editor de texto
- **Arquivos/áreas:** `apps/web/app/(app)/[orgSlug]/modelos/textos`
- **Critérios de aceite:**
  - Ao digitar `/hid` no campo de orientações, consigo inserir o texto de hidratação.
- **Testes:** e2e.

### RN-046 — Envio do plano e comunicação manual
- **Tipo:** feature
- **Pontos:** 2
- **Depende de:** RN-036
- **Descrição:** enviar plano e links ao paciente por e-mail e por WhatsApp manual (link `wa.me` com mensagem pronta), antes da automação da Fase 2.
- **Tarefas técnicas:**
  - [ ] Templates de e-mail com a marca (plano publicado, link de anamnese)
  - [ ] Botão "enviar por WhatsApp" abrindo `wa.me` com texto e link assinado
  - [ ] Registro do envio na linha do tempo
- **Arquivos/áreas:** `apps/web/lib/email`, `apps/web/.../planos`
- **Critérios de aceite:**
  - O envio fica registrado na linha do tempo do paciente com data e canal.
- **Testes:** unidade dos templates.

### RN-047 — Programa beta
- **Tipo:** feature
- **Pontos:** 3
- **Depende de:** RN-037
- **Descrição:** preparar a entrada das nutricionistas beta e a coleta de feedback.
- **Tarefas técnicas:**
  - [ ] Cadastro por convite (lista de e-mails liberados) com plano `beta`
  - [ ] Botão de feedback dentro do app (texto + print opcional) gravando em tabela `feedback`
  - [ ] Analytics de produto sem dados pessoais (ex.: PostHog com eventos: plano publicado, PDF gerado, tempo no editor)
  - [ ] Roteiro de onboarding guiado (tour) e base de ajuda inicial
  - [ ] Roteiro de entrevista e teste de usabilidade
- **Arquivos/áreas:** `apps/web`, `supabase/migrations`
- **Critérios de aceite:**
  - Uma nutricionista beta consegue se cadastrar, seguir o tour e enviar feedback sem ajuda.
- **Testes:** e2e do cadastro por convite.

### RN-048 — Revisão de desempenho e acessibilidade
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-031, RN-039
- **Descrição:** garantir boa experiência antes do beta.
- **Tarefas técnicas:**
  - [ ] Lighthouse nas telas principais (meta: desempenho ≥ 80, acessibilidade ≥ 90)
  - [ ] Revisão de consultas lentas (`pg_stat_statements`) e índices
  - [ ] Navegação completa por teclado no editor de plano e nos formulários
  - [ ] Testes com leitor de tela nas telas públicas (anamnese)
- **Arquivos/áreas:** `apps/web`, `supabase/migrations`
- **Critérios de aceite:**
  - Metas de Lighthouse atingidas nas telas: painel, pacientes, editor de plano, anamnese pública.
- **Testes:** Lighthouse CI.

### RN-049 — Endurecimento de segurança antes do beta
- **Tipo:** infra
- **Pontos:** 3
- **Depende de:** RN-020 a RN-046
- **Descrição:** revisão de segurança focada no que a fase criou.
- **Tarefas técnicas:**
  - [ ] Revisar todas as políticas RLS novas e ampliar a suíte pgTAP
  - [ ] Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, Referrer-Policy)
  - [ ] Verificar que nenhuma rota de servidor usa `service_role` sem checar organização e papel
  - [ ] Teste manual de IDOR trocando ids nas URLs
  - [ ] Backups de produção configurados e um teste de restauração
  - [ ] Revisão de logs: nenhum dado de paciente em logs e no Sentry
- **Arquivos/áreas:** `supabase/tests`, `apps/web/next.config.ts`, `apps/web/middleware.ts`
- **Critérios de aceite:**
  - Relatório da revisão em `docs/seguranca/revisao-fase-1.md` sem pendência crítica aberta.
- **Testes:** pgTAP; testes manuais documentados.

## Sequência semanal (2 desenvolvedores)

| Semana | Dev A | Dev B |
|---|---|---|
| 1 | RN-020, RN-021 | RN-027, RN-029, RN-044 |
| 2 | RN-022 | RN-023, RN-038 (base) |
| 3 | RN-025 | RN-024, RN-026 |
| 4 | RN-028 | RN-030, RN-041 |
| 5 | RN-031 | RN-032, RN-033 |
| 6 | RN-031 (final), RN-042 | RN-034, RN-045 |
| 7 | RN-036, RN-046 | RN-035, RN-040, RN-043 |
| 8 | RN-037, RN-048 | RN-039, RN-047, RN-049 |

## Critério de pronto da fase

- Em teste de usabilidade com a nutricionista parceira, uma consulta completa (cadastro → avaliação → GET → plano com substituições → PDF) é concluída em menos de 10 minutos.
- Os cálculos do `nutrition-core` foram conferidos pela nutricionista e têm cobertura acima de 95%.
- O teste e2e do fluxo completo passa de forma estável no CI.
- A revisão de segurança RN-049 não tem pendência crítica.
- Ambiente de produção pronto para receber as nutricionistas beta.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Editor de plano ficar lento ou confuso | Protótipo navegável validado na semana 3; teste de desempenho com 60+ itens |
| Divergência de cálculo com outros softwares | Plano de referência calculado manualmente; documentar diferenças por arredondamento |
| Medidas caseiras incompletas | Começar pelos alimentos mais usados; permitir edição pela organização |
| Escopo crescer durante o beta | Feedback vai para o backlog e é priorizado no ciclo seguinte; só bugs entram na hora |
| Geração de PDF instável em serverless | Avaliar as duas tecnologias na semana 6 com prova de conceito antes de decidir |

## Métricas a acompanhar

- Tempo médio para publicar um plano (do primeiro item até a publicação).
- Planos publicados por nutricionista por semana.
- Taxa de resposta das anamneses enviadas por link.
- Erros por sessão (Sentry) e feedbacks recebidos por categoria.
- Retenção semanal das nutricionistas beta.
