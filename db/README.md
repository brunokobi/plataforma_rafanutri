# Banco de dados da Rafanutri

Postgres 16 (+ pgvector) do Directus da Rafanutri ([ADR 0008](../docs/adr/0008-backend-directus.md)). As tabelas de negócio são criadas por **migrações SQL versionadas aqui**; o Directus só espelha as tabelas e cuida de API, login e permissões.

```
db/
├── migrations/                  # SQL idempotente, aplicado em ordem (0001_, 0002_, ...)
│   ├── 0001_foods.sql           # RN-010: base de alimentos e função search_foods
│   ├── 0002_organizations.sql   # RN-004: consultórios, membros, perfil profissional, planos
│   └── 0003_household_measures.sql  # RN-033: medidas caseiras de 25 alimentos comuns (revisar)
├── tests/
│   ├── 0002_organizations.test.sql  # regras do banco (transação desfeita no fim)
│   └── api-isolation.test.mjs       # RN-008: isolamento entre consultórios pela API
└── seed/
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
| `foods`, `food_nutrients` | base pública + alimentos do próprio consultório | nenhuma |
| `directus_users` | só o próprio | nome, avatar e idioma do próprio |

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
