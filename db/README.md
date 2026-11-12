# Banco de dados da Rafanutri

Postgres 16 (+ pgvector) do Directus da Rafanutri ([ADR 0008](../docs/adr/0008-backend-directus.md)). As tabelas de negócio são criadas por **migrações SQL versionadas aqui**; o Directus só espelha as tabelas e cuida de API, login e permissões.

```
db/
├── migrations/                  # SQL idempotente, aplicado em ordem (0001_, 0002_, ...)
│   ├── 0001_foods.sql           # RN-010: base de alimentos e função search_foods
│   ├── 0002_organizations.sql   # RN-004: consultórios, membros, perfil profissional, planos
│   ├── 0003_household_measures.sql  # RN-033: medidas caseiras de 25 alimentos comuns (revisar)
│   ├── 0004_patients.sql        # RN-020: pacientes, limite de ativos do plano, CPF único
│   ├── 0005_anthropometric_assessments.sql  # RN-028: avaliações por paciente (consultório e autor conferidos no banco)
│   ├── 0006_meal_plans.sql      # RN-031/036: planos alimentares por paciente (rascunho, publicado, arquivado)
│   ├── 0007_appointments.sql    # RN-022: agenda (sem sobreposição por nutricionista, btree_gist)
│   ├── 0008_anamneses.sql       # RN-024/026: modelos de questionário e anamneses com link público
│   └── 0009_meal_plan_templates.sql  # RN-035: modelos de plano alimentar
├── tests/
│   ├── 0002_organizations.test.sql  # regras do banco (transação desfeita no fim)
│   ├── 0004_patients.test.sql       # limite de 20 ativos, CPF, responsável, formatos
│   ├── 0005_anthropometric_assessments.test.sql  # consultório do paciente, autor, faixas, cascata
│   ├── 0006_meal_plans.test.sql     # ciclo de vida, um publicado por paciente, conteúdo travado após publicar
│   ├── 0007_appointments.test.sql   # sobreposição, cancelar libera horário, consultório, remarcar
│   ├── 0008_anamneses.test.sql      # cópia do questionário, versão, validade, link invalidado, transições
│   ├── 0009_meal_plan_templates.test.sql  # autor, origem do mesmo consultório, etiquetas
│   └── api-isolation.test.mjs       # RN-008: isolamento entre consultórios pela API
├── directus/
│   ├── 0005_anthropometric_assessments.mjs  # registra a coleção e as permissões no Directus (token de admin)
│   ├── 0006_meal_plans.mjs      # idem para os planos alimentares
│   ├── 0007_appointments.mjs    # idem para a agenda
│   ├── 0008_anamneses.mjs       # idem para questionários e anamneses
│   └── 0009_meal_plan_templates.mjs  # idem para os modelos de plano
└── seed/
    ├── dev/
    │   └── seed-nutricionista.mjs  # usuário de teste como nutricionista + consultório + 9 pacientes fictícios
    ├── questionnaires/  # RN-024: modelos padrão de anamnese (JSON) + seed-sql.mjs
    └── taco/            # RN-011: TACO 4ª edição
        ├── taco-4ed.csv         # 597 alimentos × 29 nutrientes (gerado, versionado)
        ├── import.sql           # importador idempotente (upsert)
        └── build_taco_csv.py    # gera o CSV a partir da planilha oficial
```

Cada migração registra a própria versão em `schema_migrations`.

## Aplicar (VPS)

O Postgres não tem porta publicada. Copie os arquivos para o contêiner e rode o `psql` dentro dele:

```bash
docker cp db/. rafanutri-postgres:/tmp/db
docker exec rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1 -f /tmp/db/migrations/0001_foods.sql
docker exec rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1 \
  -v csv=/tmp/db/seed/taco/taco-4ed.csv -f /tmp/db/seed/taco/import.sql
docker exec rafanutri-postgres rm -rf /tmp/db
```

Antes de qualquer migração em produção, faça um `pg_dump` (`~/backups/rafanutri/` na VPS). O importador termina com erro se não houver exatamente 597 alimentos e 597 × 29 valores.

Depois de criar tabelas novas, registre-as no Directus (`POST /collections` com só o `meta`; as relações são detectadas pelas chaves estrangeiras) e dê as permissões ao papel certo.

## Seed de desenvolvimento

Deixa um usuário pronto para testar como nutricionista: consultório no plano gratuito (CRN fictício) e 9 pacientes fictícios (7 ativos, 1 inativo, 1 arquivado). Usa só o login do próprio usuário pela API, então passa pelas mesmas permissões e regras do app. Pode rodar quantas vezes quiser: não duplica.

```bash
SEED_EMAIL=<email> SEED_PASSWORD=<senha> node db/seed/dev/seed-nutricionista.mjs
# conta nova pelo cadastro público, se ainda não existir:
SEED_CREATE_USER=1 SEED_EMAIL=<email> SEED_PASSWORD=<senha> SEED_FIRST_NAME=Ana node db/seed/dev/seed-nutricionista.mjs
```

Já aplicada em 10/11/2026 para o usuário de teste `brunokobi2@hotmail.com`.

## Consultórios e isolamento (Fase 0)

| Tabela | Conteúdo |
|---|---|
| `plans` | Planos e limites (`free`: 20 pacientes ativos, 1 membro) |
| `organizations` | Consultório: nome, `slug` único, tipo, cor, logo, plano |
| `organization_members` | Usuário do Directus no consultório, com papel `owner`, `nutritionist` ou `assistant` |
| `professional_profiles` | CRN e regional do usuário |

**Regras no banco (gatilhos):** todo consultório tem ao menos um `owner`; o número de membros respeita o plano. A função `create_organization(user, nome, tipo, cor, crn, regional)` cria consultório, owner e perfil numa transação e é idempotente por usuário.

**Endpoint** (extensão `directus/extensions/rafanutri`, copiada para `~/apps/rafanutri-directus/extensions/rafanutri` na VPS, com `chmod -R a+rX`, e `docker compose restart directus`):
- `POST /rafanutri/organizations`: onboarding (exige login).
- `GET /rafanutri/me/organizations`: consultórios do usuário com o papel dele.

**Permissões do papel Profissional** (política `Profissional - próprio perfil`, filtradas por `$CURRENT_USER`; exigem a licença do Directus, ver ADR 0008):

| Coleção | Leitura | Escrita |
|---|---|---|
| `organizations` | consultórios em que é membro | `owner` altera nome, cor, logo e tipo (não o plano) |
| `organization_members` | membros dos próprios consultórios | nenhuma (convites entram no RN-007) |
| `professional_profiles` | o próprio | CRN e regional do próprio |
| `plans` | todos | nenhuma |
| `appointments` | consultas dos consultórios em que é owner ou nutricionista | marca (quem marca atende, se não indicar outro nutricionista do consultório); remarca, confirma, conclui, registra falta e cancela; **não apaga** |
| `patients` | dos consultórios em que é owner ou nutricionista | cria no próprio consultório (responsável = ele mesmo); edita dados e status; **não apaga** (arquiva) |
| `foods`, `food_nutrients` | base pública + alimentos do próprio consultório | nenhuma |
| `directus_users` | só o próprio | nome, avatar e idioma do próprio |

**Gancho** (extensão `directus/extensions/rafanutri-hooks`, instalada do mesmo jeito): na criação de paciente, confere se o usuário é owner/nutricionista do consultório, fixa o responsável e antecipa o limite do plano com mensagem clara; na edição, impede trocar consultório e responsável. As mesmas regras estão nos gatilhos do banco.

**Cadastro público:** ligado no Directus com o papel Profissional e **sem verificação por e-mail** (não há SMTP). `USER_REGISTER_URL_ALLOW_LIST` no `.env` lista as URLs de verificação aceitas.

### Testes

```bash
# regras do banco (na VPS)
docker cp db/. rafanutri-postgres:/tmp/db
docker exec rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1 -f /tmp/db/tests/0002_organizations.test.sql

# isolamento pela API (de qualquer máquina; cria e apaga 2 usuários de teste)
DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=<token> node db/tests/api-isolation.test.mjs
```

## Base de alimentos

| Tabela | Conteúdo |
|---|---|
| `food_sources` | Fonte (`TACO`, depois `TBCA` e `CUSTOM`), versão, citação e licença |
| `nutrients` | 29 nutrientes com código e unidade (`energy_kcal`, `protein_g`, `carbohydrate_g`, `lipid_g`, `fiber_g`, ...) |
| `foods` | Alimento, grupo, código na fonte, medidas caseiras (`jsonb`) e `search_name` (nome sem acento, minúsculo, com índice trigram) |
| `food_nutrients` | Valor por 100 g: `null` = não analisado (NA); `0` com `is_trace = true` = traço (Tr) |

Os códigos dos nutrientes são os mesmos usados pelo `@rafanutri/nutrition-core` (`NutrientValues`).

### Busca

- **Pela API do Directus (o app usa assim):** normalize o termo (minúsculo, sem acento) e filtre `search_name` com `_contains` por palavra:
  `GET /items/foods?filter[_and][0][search_name][_contains]=feijao&filter[_and][1][search_name][_contains]=carioca`
- **No banco:** `select * from search_foods('feijao carioca', <org_id>, 20)` — tolerante a erro de digitação (`pg_trgm`), prioriza a base da organização e a TACO. Vai virar endpoint de extensão do Directus.

Composição de um alimento: `GET /items/foods/561?fields=name,nutrients.amount_per_100g,nutrients.is_trace,nutrients.nutrient_id.code`

### Permissões

O papel **Profissional** lê `foods`, `food_nutrients`, `nutrients` e `food_sources`, mas não altera nada. Sem login, não há acesso.

A leitura já está filtrada: base pública (`organization_id` nulo) mais os alimentos do próprio consultório.

### Origem dos dados da TACO

- **Fonte oficial:** NEPA/UNICAMP. *Tabela Brasileira de Composição de Alimentos – TACO*, 4ª ed. rev. e ampl., 2011. Reprodução permitida com citação da fonte (registrada em `food_sources.citation`).
- **Arquivos usados:** planilha oficial `Taco_4a_edicao_2011.xls` e os CSVs normalizados do projeto [raulfdm/taco-api](https://github.com/raulfdm/taco-api) (MIT), pasta `references/`.
- O gerador usa os números arredondados dos CSVs (iguais aos da publicação) e as marcações `Tr`/`NA` da planilha oficial, que os CSVs perdem. Todos os valores foram conferidos contra a planilha: as únicas diferenças são arredondamentos de x,5 e um erro de digitação da própria planilha (alimento 373, piridoxina `,0,02` → 0,02).

Regerar o CSV (só se a fonte mudar):

```bash
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install xlrd==2.0.1
/tmp/venv/bin/python db/seed/taco/build_taco_csv.py <pasta_com_original.xls_e_csvs> db/seed/taco/taco-4ed.csv
```

## Avaliações antropométricas (RN-028)

Tabela `anthropometric_assessments`: medidas (peso, altura, cintura, quadril), protocolo e dobras (`skinfolds`, jsonb), **resultados** calculados pelo `@rafanutri/nutrition-core` (`results`, jsonb, com a `calc_version`), observações, autor (`user_created`, preenchido pelo Directus) e datas.

**Regras no banco (gatilho `anthropometric_guard`)**, que dispensam gancho na extensão:
- a avaliação é do mesmo consultório do paciente;
- o autor é owner ou nutricionista do consultório;
- consultório e paciente não mudam depois.

**Permissões** (script `db/directus/0005_anthropometric_assessments.mjs`): copia o filtro de leitura e edição de `patients` para a nova coleção; cria sem filtro (o gatilho valida); edita só data e observações; **não apaga** (histórico preservado).

### Como ativar (uma vez)

```bash
# 1. migração e testes (na VPS; o teste roda numa transação desfeita)
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/migrations/0005_anthropometric_assessments.sql
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/tests/0005_anthropometric_assessments.test.sql

# 2. coleção e permissões no Directus
ssh vpsrafa 'cd ~/apps/rafanutri-directus && docker compose restart directus'   # recarrega o schema (tabela nova)
DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=<token> node db/directus/0005_anthropometric_assessments.mjs

# 3. isolamento pela API (inclui as verificações das avaliações)
DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=<token> node db/tests/api-isolation.test.mjs
```

Enquanto isso não for feito, a tela de avaliações calcula tudo e avisa que a gravação ainda não foi liberada.

## Planos alimentares por paciente (RN-031, RN-036)

Tabela `meal_plans`: título, situação (`draft`, `published`, `archived`), modo (`quantitative` ou `qualitative`), metas (`targets`, jsonb), refeições com itens e substituições (`meals`, jsonb com ids da TACO e gramas), orientações (até 4000 caracteres), totais calculados no servidor (`totals`), validade, data de publicação, autor e datas.

**Regras no banco (gatilho `meal_plans_guard`):**
- todo plano nasce como rascunho; o paciente é do mesmo consultório; o autor é owner ou nutricionista;
- consultório e paciente não mudam depois;
- plano publicado ou arquivado **não muda de conteúdo** (para alterar, crie uma nova versão);
- publicado não volta a rascunho e arquivado não é republicado;
- ao publicar, o plano publicado anterior do paciente é arquivado, e `published_at` e `valid_until` (hoje + 30 dias, se vazio) são preenchidos;
- índice único: **um plano publicado por paciente**.

**Permissões** (script `db/directus/0006_meal_plans.mjs`): copia o filtro de `patients`; cria sem filtro (o gatilho valida); edita conteúdo, situação e validade; **apaga só rascunho**.

No app: aba **Plano alimentar** da ficha (`/app/pacientes/[id]/planos`) com a lista de versões, "Novo plano", "Nova versão" (copia um publicado ou arquivado) e o editor em `/app/pacientes/[id]/planos/[planId]`. Ao publicar, os totais são recalculados no servidor com os alimentos do banco. O PDF usa o nome e a cor do consultório e o CRN do perfil profissional.

### Como ativar (uma vez)

```bash
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/migrations/0006_meal_plans.sql
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/tests/0006_meal_plans.test.sql
ssh vpsrafa 'cd ~/apps/rafanutri-directus && docker compose restart directus'   # recarrega o schema (tabela nova)
DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=<token> node db/directus/0006_meal_plans.mjs
```

A 0006 não depende da 0005, mas a tela do plano usa o peso e a altura da última avaliação para calcular as metas; sem avaliações, o editor pede as calorias manualmente. Antes de ativar, a aba mostra o aviso de ativação e o link para o editor de demonstração.

## Agenda (RN-022)

Migração `0007_appointments.sql`, testes em `db/tests/0007_appointments.test.sql`, registro em `db/directus/0007_appointments.mjs`. **Aplicada e registrada na vpsrafa em 12/11/2026.**

| Regra | Onde |
|---|---|
| O mesmo nutricionista não tem duas consultas sobrepostas (cancelada e falta não ocupam o horário; encostadas são permitidas) | restrição `exclude using gist` (extensão `btree_gist`) |
| Paciente do mesmo consultório; nutricionista e autor são owner/nutricionista do consultório; sem nutricionista informado, quem marca atende | gatilho `appointments_guard` |
| Não muda de consultório nem de paciente; concluída e cancelada não são remarcadas | gatilho |
| Conflito de horário com mensagem clara ("Horário ocupado…") em vez de erro 500 | gancho `rafanutri-hooks` (create e update) |
| Ler e editar (horário, tipo, atendimento, link, observação, situação) só no próprio consultório; **sem apagar** (cancela) | permissões copiadas de `patients` pelo script |

Horários em `timestamptz`; o app mostra em horário de Brasília (UTC-3 fixo, sem horário de verão desde 2019). O histórico de remarcações fica nas revisões do Directus.

```bash
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/migrations/0007_appointments.sql
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/tests/0007_appointments.test.sql
# gancho atualizado: copiar directus/extensions/rafanutri-hooks para a VPS (chmod -R a+rX)
ssh vpsrafa 'cd ~/apps/rafanutri-directus && docker compose restart directus'   # recarrega schema e gancho
DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=<token> node db/directus/0007_appointments.mjs
```

## Anamneses (RN-024 a RN-026)

Migração `0008_anamneses.sql`, testes em `db/tests/0008_anamneses.test.sql`, registro em `db/directus/0008_anamneses.mjs`, modelos padrão em `db/seed/questionnaires/*.json`. O formato do questionário e o validador ficam em `packages/forms` (o mesmo código roda no app, nos testes e na extensão do Directus). **Aplicada, com os 3 modelos padrão gravados e as coleções registradas no Directus, em 12/11/2026**; teste de isolamento pela API com 43 verificações passando.

| Regra | Onde |
|---|---|
| Modelos padrão (`organization_id` nulo) visíveis para todos e não editáveis; o consultório duplica para adaptar | permissões (script) |
| Modelo do consultório: versão sobe a cada mudança do conteúdo | gatilho `questionnaire_templates_guard` |
| No envio, o banco **copia o questionário** (`schema_snapshot`) e zera as respostas: mudar o modelo não altera anamneses já enviadas | gatilho `anamneses_guard` |
| Link público: token aleatório de 32 bytes; o banco guarda **só o hash sha256**; validade padrão de 7 dias, máximo 30 | app (`lib/anamneses/token.ts`) + gatilho |
| Responder ou cancelar **apaga o hash**: o link deixa de funcionar | gatilho |
| Respostas só mudam enquanto a anamnese está enviada; transições `sent → answered/cancelled` e `answered → reviewed` | gatilho |
| O profissional não lê o hash, não edita respostas e só muda a situação para revisada ou cancelada | permissões (campos e validação) |
| `GET/POST /rafanutri/public/anamneses/:token` (sem login): devolve só o questionário, o rascunho, o primeiro nome do paciente e a marca do consultório; valida as respostas com o mesmo validador do app (rascunho não exige obrigatórias) | extensão `rafanutri` (`forms.js` é cópia de `packages/forms/src/forms.js`: `pnpm --filter @rafanutri/forms sync`) |

```bash
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/migrations/0008_anamneses.sql
node db/seed/questionnaires/seed-sql.mjs | ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1'
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/tests/0008_anamneses.test.sql
# extensão atualizada (index.js + forms.js) → copiar para a VPS (chmod -R a+rX) e reiniciar o Directus
DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=<token> node db/directus/0008_anamneses.mjs
```

Os modelos padrão (clínica adulto, esportiva e recordatório de 24 h) são uma **primeira versão a validar com a nutricionista**; o teste do pacote `@rafanutri/forms` garante que todos passam no validador.

## Modelos de plano (RN-035)

Migração `0009_meal_plan_templates.sql`, testes em `db/tests/0009_meal_plan_templates.test.sql`, registro em `db/directus/0009_meal_plan_templates.mjs`. **Migração aplicada na vpsrafa em 12/11/2026.**

| Regra | Onde |
|---|---|
| Modelo guarda o conteúdo de um plano (refeições, metas, orientações, energia do dia) sem paciente | tabela `meal_plan_templates` |
| `organization_id` nulo = biblioteca da plataforma (métodos de prescrição, a validar com a nutricionista): visível para todos, não editável | permissões (script) |
| Autor owner/nutricionista; plano de origem do mesmo consultório; não muda de consultório; até 10 etiquetas de até 30 caracteres, normalizadas | gatilho `meal_plan_templates_guard` |
| Aplicar um modelo cria um **rascunho** de plano para o paciente (cópia); com meta de calorias, as quantidades são escaladas pelo fator meta ÷ energia do modelo (limitado a 0,3–3×) e arredondadas de 5 em 5 g (abaixo de 20 g, de 1 em 1 g) | app (`lib/meal-plans/scale.ts`, `template-actions.ts`) |
