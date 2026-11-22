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
│   ├── 0009_meal_plan_templates.sql  # RN-035: modelos de plano alimentar
│   ├── 0010_meal_plan_templates_tags_jsonb.sql  # etiquetas em jsonb (o Directus não grava text[])
│   ├── 0011_library_templates_guard.sql  # segurança: usuário não cria modelo sem consultório
│   ├── 0012_require_author.sql  # segurança: autor obrigatório na criação; revisor só na revisão
│   ├── 0013_custom_foods_recipes.sql  # RN-041/042: alimentos próprios e preparações do consultório
│   ├── 0014_text_snippets.sql         # RN-045: orientações reutilizáveis do consultório
│   ├── 0015_clinical_notes.sql        # RN-023: evoluções do prontuário (assinatura e retificação)
│   ├── 0016_clinical_notes_cascade.sql # RN-023: exclusão em cascata leva as evoluções
│   ├── 0017_plan_waitlist.sql          # RN-200/202: lista de interesse no plano pago
│   └── 0018_patient_app_access.sql     # RN-203/204: convite do paciente, vínculo da conta e papel Paciente
├── tests/
│   ├── 0002_organizations.test.sql  # regras do banco (transação desfeita no fim)
│   ├── 0004_patients.test.sql       # limite de 20 ativos, CPF, responsável, formatos
│   ├── 0005_anthropometric_assessments.test.sql  # consultório do paciente, autor, faixas, cascata
│   ├── 0006_meal_plans.test.sql     # ciclo de vida, um publicado por paciente, conteúdo travado após publicar
│   ├── 0007_appointments.test.sql   # sobreposição, cancelar libera horário, consultório, remarcar
│   ├── 0008_anamneses.test.sql      # cópia do questionário, versão, validade, link invalidado, transições
│   ├── 0009_meal_plan_templates.test.sql  # autor, origem do mesmo consultório, etiquetas
│   ├── 0012_require_author.test.sql   # nada é criado sem autor; seed da plataforma continua valendo
│   ├── 0013_custom_foods_recipes.test.sql  # fonte CUSTOM, autor, ingredientes do mesmo consultório
│   ├── 0014_text_snippets.test.sql         # autor do consultório, biblioteca só por seed, campos aparados
│   ├── 0015_clinical_notes.test.sql        # rascunho, assinatura imutável, retificação em cadeia
│   ├── 0016_clinical_notes_cascade.test.sql # cascata apaga; DELETE/UPDATE direto de assinada barrado
│   ├── 0017_plan_waitlist.test.sql          # só o owner registra, um por consultório
│   ├── 0018_patient_app_access.test.sql     # vínculo só pelos endpoints, convite de uso único
│   ├── extension-foods.test.mjs       # conversão porção → 100 g e composição da preparação (node --test)
│   ├── extension-documents.test.mjs   # validação dos documentos clínicos (node --test)
│   ├── extension-finance.test.mjs     # validação dos lançamentos e meses do gráfico (node --test)
│   ├── extension-crm.test.mjs         # telefone E.164 e validação do lead (node --test)
│   ├── extension-booking.test.mjs     # horários livres e validação do pedido online (node --test)
│   ├── extension-maternal.test.mjs    # validação de medidas, lactação, introdução alimentar e responsáveis (node --test)
│   └── api-isolation.test.mjs       # RN-008/RN-213: isolamento pela API (db/scripts/isolation-test.sh roda sem token)
├── directus/
│   ├── 0005_anthropometric_assessments.mjs  # registra a coleção e as permissões no Directus (token de admin)
│   ├── 0006_meal_plans.mjs      # idem para os planos alimentares
│   ├── 0007_appointments.mjs    # idem para a agenda
│   ├── 0008_anamneses.mjs       # idem para questionários e anamneses
│   └── 0009_meal_plan_templates.mjs  # idem para os modelos de plano
└── seed/
    ├── dev/
    │   ├── seed-nutricionista.mjs  # usuário de teste como nutricionista + consultório + 9 pacientes fictícios
    │   └── seed-demo.mjs           # RN-038: agenda, avaliações com evolução, planos publicados e anamneses
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

**Demonstração completa (RN-038):** `SEED_EMAIL=<email> SEED_PASSWORD=<senha> pnpm db:seed:demo` roda a seed acima e depois `seed-demo.mjs`, que acrescenta, para cada paciente ativo, agenda de 4 semanas (consulta concluída e retorno marcado; um paciente fica sem retorno para aparecer no painel), 3 avaliações com evolução de peso, plano publicado com alimentos da TACO (5 primeiros) e anamnese clínica respondida (3 primeiros, um com intolerância à lactose para mostrar o destaque na ficha). Idempotente por paciente. No plano gratuito: 1 profissional e até 20 pacientes ativos (o RN-038 pedia 3 profissionais e 30 pacientes, o que exige plano pago). Aplicada em 13/11/2026 no usuário de teste.

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

# ou, sem token de admin, da máquina com a chave SSH da vpsrafa (tabelas e limpeza pelo banco)
db/scripts/isolation-test.sh
```

## Base de alimentos

| Tabela | Conteúdo |
|---|---|
| `food_sources` | Fonte (`TACO`, `IBGE`, `OFF`, `USDA`, `CUSTOM`; `TBCA` só com licença), versão, citação e licença |
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

### Open Food Facts (Brasil) e USDA FoodData Central

Migração `0064_food_sources_off_usda.sql` (**aplicada na vpsrafa em 21/11/2026**, backup `antes-0064-2026-11-21.dump`): fontes `OFF` e `USDA` com citação e licença. Os alimentos entram pelo importador genérico `db/seed/import_foods.sql` (idempotente, atualiza o que já existe e confere a contagem; backup `antes-usda-2026-11-21.dump` antes da carga):

```bash
psql -v ON_ERROR_STOP=1 -v source=OFF  -v csv=db/seed/off/off-brasil.csv       -f db/seed/import_foods.sql
psql -v ON_ERROR_STOP=1 -v source=USDA -v csv=db/seed/usda/usda-sr-legacy.csv  -f db/seed/import_foods.sql
```

- **Open Food Facts — 8.494 produtos industrializados vendidos no Brasil** (tabela nutricional do rótulo por 100 g, "porção do rótulo" como medida). Filtros: energia coerente com os macros (Atwater ±25%), kJ coerente, sem valores impossíveis, um por nome. Licença **ODbL** (base) — atribuição "Open Food Facts contributors" exibida na ficha. Geradores: `db/seed/off/fetch_off.py` (busca por prefixo de código de barras em search.openfoodfacts.org), `enrich_off.py` (categorias e porção pela API de produto) e `build_off_csv.py`.
- **USDA SR Legacy (abril de 2018) — 6.132 alimentos** com até 35 nutrientes e medidas caseiras traduzidas (xícara, colher, fatia, unidade…). Ficam de fora alimentos infantis, fast-food, restaurantes e itens de marca. **Domínio público (CC0)**, citação "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central". Nomes traduzidos por IA (modelos gratuitos) em `db/seed/usda/usda-names-pt.json` — revisáveis; gerador `build_usda_csv.py`.
- **Limpeza** (`db/seed/prune_source.sql`, mesmos parâmetros, depois do import): remove da fonte os itens que saíram do CSV, só se nenhum plano, modelo, preparação ou insumo aponta para eles. Refino de 22/11/2026: backup `antes-off-refino-2026-11-22.dump`, 357 removidos.
- Na busca do editor, TACO, IBGE e alimentos do consultório vêm primeiro; Rótulo (OFF) e USDA completam a lista.

### Base do IBGE (POF 2008-2009)

Migração `0061_food_source_ibge.sql` (**aplicada na vpsrafa em 21/11/2026**, backup `antes-0061-2026-11-21.dump`): fonte `IBGE` e 9 nutrientes a mais (açúcares totais e de adição, gorduras trans, sódio de adição, selênio, B12, folato, vitaminas D e E). Os alimentos entram por `db/seed/ibge/import.sql` (idempotente; confere contagem no fim):

- **1.923 alimentos e preparações** como o brasileiro consome (arroz com feijão, feijão tropeiro, cuscuz, moqueca, sucos…), cada preparo (cru, cozido, frito, grelhado…) como um item; `source_code` = `<código do alimento>-<código do preparo>`.
- **Medidas caseiras** da *Tabela de Medidas Referidas* em `household_measures` (até 12 por alimento, sem grama/quilo/litro): 1.919 alimentos têm pelo menos uma.
- Classificados nos **15 grupos da TACO** (prefixo do código + palavras-chave), para a navegação por grupo valer para as duas tabelas.
- Nomes em minúsculas com acento restaurado (vocabulário da TACO + lista do gerador); itens "orgânicos" ficam de fora (mesmos valores do comum).
- "-" na fonte (não disponível) vira nulo. **Sódio** sem o sal do preparo; o sal do preparo fica em `added_sodium_mg`.
- **Licença:** dados públicos do IBGE, com citação (em `food_sources.citation`). Fontes: `ftp.ibge.gov.br/Orcamentos_Familiares/Pesquisa_de_Orcamentos_Familiares_2008_2009/` (`tabelacompleta.zip` e `tabelamedidas_bd.zip`).

Regerar e importar:

```bash
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install xlrd==2.0.1
/tmp/venv/bin/python db/seed/ibge/build_pof_csv.py <pasta_com_tabelacompleta.xls_e_tabelamedidas_bd.xls> db/seed/taco/taco-4ed.csv db/seed/ibge/pof-2008-2009.csv
psql -v ON_ERROR_STOP=1 -v csv=db/seed/ibge/pof-2008-2009.csv -f db/seed/ibge/import.sql
```

A TBCA (USP) não entra: consultar é livre, mas usar a base dentro de outro sistema exige licença paga.

## Materno-infantil (0062)

Migração `0062_maternal.sql` (**aplicada na vpsrafa em 21/11/2026**, backup `antes-0062-2026-11-21.dump`; testes em `db/tests/0062_maternal.test.sql`):

- `anthropometric_assessments` ganha `head_circumference_cm` (25 a 60) e `measured_lying` (deitado/em pé) para as curvas da OMS; as medidas do módulo entram por `POST /rafanutri/patients/:id/maternal/measurements`.
- `pregnancies`: DUM, peso pré-gestacional, altura, situação (`active`/`ended`, com data e motivo), observações. Uma gestação ativa por paciente (índice único parcial); só paciente do consultório e não masculina; autor owner/nutricionista; não muda de consultório nem de paciente (gatilho `pregnancies_guard`); auditada. O peso ao longo das semanas vem das avaliações da paciente.
- Endpoints em `directus/extensions/rafanutri/maternal.js`, liberados nos planos Profissional e Clínica ou com o módulo `maternal` em `organizations.modules`.

### Segunda parte (0065)

Migração `0065_maternal_care.sql` (**aplicada na vpsrafa em 22/11/2026**, backup `antes-0065-2026-11-22.dump`; testes em `db/tests/0065_maternal_care.test.sql` e `db/tests/extension-maternal.test.mjs`):

- `lactations`: início, tipo de aleitamento, desmame e `baby_patient_id` opcional (paciente do mesmo consultório); uma ativa por paciente; auditada.
- `feeding_intro_progress`: um registro por criança × item (`allergen` ou `texture`), com data e reação (textura não tem reação). Grava o owner/nutricionista do consultório ou a conta ligada ao paciente (`by_guardian` = true); endpoints `PUT /patients/:id/feeding/:kind/:item` e `PUT /me/patient/feeding/:kind/:item`.
- `patient_guardians`: responsáveis e consentimento (`consent_at` e `consent_method` juntos). Convite do app de paciente menor de 18 anos exige `guardian_id` com consentimento (`patient_app_invites.guardian_id`, conferido por trigger); o índice único conta × consultório virou índice comum (um responsável, vários filhos).
- `patient_share` ganha `show_maternal` (desligado por padrão): libera `GET /me/patient/maternal` no app.
- Aviso `feeding_reaction` na fila: reação moderada ou grave registrada pelo responsável avisa o nutricionista do paciente (ou os owners).

## Assistente de IA (0063)

Migração `0063_ai_requests.sql` (**aplicada na vpsrafa em 21/11/2026**, backup `antes-0063-2026-11-21.dump`): `ai_requests` registra cada pedido ao assistente (consultório, usuário, tipo, modelo, paciente, tokens, ok/erro) para a cota diária. **Não guarda o texto enviado nem a resposta.** Endpoints `GET /rafanutri/ai/status` e `POST /rafanutri/ai/ask` em `directus/extensions/rafanutri/ai.js`; regras puras (modelos gratuitos, anonimização, mensagens) em `ai-core.js`, testadas em `db/tests/extension-ai.test.mjs`.

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

Migração `0008_anamneses.sql`, testes em `db/tests/0008_anamneses.test.sql`, registro em `db/directus/0008_anamneses.mjs`, modelos padrão em `db/seed/questionnaires/*.json`. O formato do questionário e o validador ficam em `packages/forms` (o mesmo código roda no app, nos testes e na extensão do Directus). **Aplicada, com os 3 modelos padrão gravados e as coleções registradas no Directus, em 12/11/2026**; teste de isolamento pela API com 53 verificações passando.

| Regra | Onde |
|---|---|
| Modelos padrão (`organization_id` nulo) visíveis para todos e não editáveis; o consultório duplica para adaptar | permissões (script) |
| Modelo do consultório: versão sobe a cada mudança do conteúdo | gatilho `questionnaire_templates_guard` |
| No envio, o banco **copia o questionário** (`schema_snapshot`) e zera as respostas: mudar o modelo não altera anamneses já enviadas | gatilho `anamneses_guard` |
| Link público: token aleatório de 32 bytes; o banco guarda **só o hash sha256**; validade padrão de 7 dias, máximo 30 | app (`lib/anamneses/token.ts`) + gatilho |
| Responder ou cancelar **apaga o hash**: o link deixa de funcionar | gatilho |
| Respostas só mudam enquanto a anamnese está enviada; transições `sent → answered/cancelled` e `answered → reviewed` | gatilho |
| O profissional não lê o hash, não edita respostas e só muda a situação para revisada ou cancelada | permissões (campos e validação) |
| `POST /rafanutri/public/anamneses/open` e `POST /rafanutri/public/anamneses/save` (sem login; **o token vai no corpo, nunca na URL**, para não entrar em logs de acesso): devolve só o questionário, o rascunho, o primeiro nome do paciente e a marca do consultório; valida as respostas com o mesmo validador do app (rascunho não exige obrigatórias) | extensão `rafanutri` (`forms.js` é cópia de `packages/forms/src/forms.js`: `pnpm --filter @rafanutri/forms sync`) |

```bash
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/migrations/0008_anamneses.sql
node db/seed/questionnaires/seed-sql.mjs | ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1'
ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1' < db/tests/0008_anamneses.test.sql
# extensão atualizada (index.js + forms.js) → copiar para a VPS (chmod -R a+rX) e reiniciar o Directus
DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=<token> node db/directus/0008_anamneses.mjs
```

Os modelos padrão (clínica adulto, esportiva e recordatório de 24 h) são uma **primeira versão a validar com a nutricionista**; o teste do pacote `@rafanutri/forms` garante que todos passam no validador.

## Modelos de plano (RN-035)

Migrações `0009_meal_plan_templates.sql` e `0010_meal_plan_templates_tags_jsonb.sql`, testes em `db/tests/0009_meal_plan_templates.test.sql`, registro em `db/directus/0009_meal_plan_templates.mjs`. **Aplicadas e registradas na vpsrafa em 12/11/2026.**

> **Gotcha:** o Directus não grava colunas `text[]` do Postgres (envia o array como texto JSON → `malformed array literal`, erro 500). Use `jsonb` para listas, como as etiquetas (corrigido na 0010).

| Regra | Onde |
|---|---|
| Modelo guarda o conteúdo de um plano (refeições, metas, orientações, energia do dia) sem paciente | tabela `meal_plan_templates` |
| `organization_id` nulo = biblioteca da plataforma (métodos de prescrição, a validar com a nutricionista): visível para todos, não editável | permissões (script) |
| Autor owner/nutricionista; plano de origem do mesmo consultório; não muda de consultório; até 10 etiquetas de até 30 caracteres, normalizadas | gatilho `meal_plan_templates_guard` |
| Aplicar um modelo cria um **rascunho** de plano para o paciente (cópia); com meta de calorias, as quantidades são escaladas pelo fator meta ÷ energia do modelo (limitado a 0,3–3×) e arredondadas de 5 em 5 g (abaixo de 20 g, de 1 em 1 g) | app (`lib/meal-plans/scale.ts`, `template-actions.ts`) |

### Biblioteca de modelos da plataforma

`db/seed/plan-library/build_library.py` gera `library.sql` (aplicado na vpsrafa em 21/11/2026, backup `antes-biblioteca-2026-11-21.dump`): **42 modelos** sem consultório, em 9 padrões (tradicional brasileiro, ovolactovegetariano, vegano, mediterrâneo adaptado, DASH, controle glicêmico, gestante, pessoa idosa e criança escolar) e faixas de 1.200 a 2.600 kcal.

- Cada padrão tem uma refeição-base de ~2.000 kcal; para cada faixa o gerador acha o fator que leva o dia à meta, escalando por classe (verduras fixas; frutas, laticínios e proteínas pouco; cereais, tubérculos e gorduras na proporção) e arredondando como o app.
- Até 3 **substituições de mesma energia** por item; orientações escritas para a Rafanutri (base: Guia Alimentar, DASH, padrões do USDA).
- Alimentos citados como `FONTE:código` e trocados pelo id do banco no SQL; ids dos modelos estáveis (uuid5), então rodar de novo atualiza; modelos retirados da lista são apagados. Confere no fim que nenhum alimento ficou sem id.
- Todos com "Modelo base — revisar antes de prescrever": **dependem da validação da RT**.

```bash
python3 db/seed/plan-library/build_library.py      # gera library.sql e imprime kcal, macros, fibra e sódio de cada modelo
psql -v ON_ERROR_STOP=1 -f db/seed/plan-library/library.sql
```

## Segurança: biblioteca da plataforma (0011)

Modelos com `organization_id` nulo (questionários padrão e, no futuro, a biblioteca de métodos de prescrição) aparecem para **todos** os consultórios. Em 12/11/2026 o teste de isolamento mostrou que um usuário conseguia criar um modelo de plano sem consultório: a validação `_nnull` da permissão do Directus **não é aplicada quando o campo não vem no corpo**. Correção:

- gatilho `library_templates_guard` (migração 0011) em `questionnaire_templates` e `meal_plan_templates`: modelo sem consultório só pode ser criado direto no banco (seeds, sem `user_created`);
- gancho `rafanutri-hooks`: responde 403 com mensagem clara e confere se o usuário é owner/nutricionista do consultório informado;
- cenários no teste de isolamento para as duas coleções.

**Lição para as próximas coleções:** não confiar em `validation` do Directus para campos obrigatórios de segurança; garantir no banco (gatilho ou `not null`) e, se quiser mensagem clara, no gancho.

## Revisão de segurança das permissões (12/11/2026)

Levantamento de todas as políticas e permissões em vigor:

| Política | Ligada a | Resultado |
|---|---|---|
| Pública (sem login) | acesso anônimo | **nenhuma permissão** sobre dados; só os endpoints públicos da extensão (anamnese por token) e o cadastro |
| Administrator | admin | só para scripts de manutenção |
| Profissional - próprio perfil | papel Profissional | 36 regras: leitura e edição filtradas pelo consultório (`$CURRENT_USER` como owner/nutricionista); criação sem filtro em 6 coleções, protegida por gatilhos |

Achados e correções:

1. **Criação sem filtro dependia de `user_created` preenchido** (avaliações, planos, agenda, anamneses, modelos): os gatilhos pulavam a checagem de consultório quando o autor vinha vazio — o que já aconteceu com as avaliações antes de o campo ter o preenchimento automático. **0012:** autor obrigatório na criação (seeds da plataforma, sem consultório, continuam valendo).
2. **`validation` do Directus não vale para campo ausente** (`_nnull`, `_eq`, `_in`): não usar como proteção. Modelos sem consultório → **0011**; responsável do paciente → protegido pelo gancho e pelo gatilho; revisor da anamnese → **0012** (só muda ao marcar como revisada) e campo retirado da permissão de edição.
3. Teste de isolamento ganhou os casos de criar no consultório alheio em todas as coleções, forjar o autor, revisor arbitrário, perfis e membros de outro consultório e acesso anônimo a todas as coleções de dados.

**Regra para novas coleções:** leitura/edição com o filtro de consultório; criação protegida por gatilho que **exige** autor e confere o consultório; nada de segurança em `validation`; cenários novos no teste de isolamento.

## Alimentos e preparações do consultório (RN-041, RN-042)

Migração `0013_custom_foods_recipes.sql` (**aplicada na vpsrafa em 12/11/2026**), testes em `db/tests/0013_custom_foods_recipes.test.sql` e `db/tests/extension-foods.test.mjs`. Não precisa de script de registro no Directus: a gravação é pelos endpoints da extensão e a leitura usa a permissão de `foods` que já existe.

| Regra | Onde |
|---|---|
| Alimento próprio e preparação ficam em `foods` com `organization_id` do consultório e fonte `CUSTOM`; aparecem na busca do editor junto com a TACO (etiqueta "Próprio"/"Preparação") e só o consultório vê | tabela `foods` (+ `kind`, `archived`, `user_created`) e permissão de leitura existente |
| Base pública só por seed/importador; consultório não cria alimento público nem preparação pública | gatilho `foods_guard` |
| Alimento de consultório: fonte CUSTOM, autor owner/nutricionista, não muda de consultório nem de tipo | gatilho `foods_guard` |
| "Apagar" = arquivar: some da busca e dos substitutos, mas planos antigos continuam mostrando | coluna `archived` + filtro na busca |
| Preparação: ingredientes da base pública ou do próprio consultório (nunca ela mesma), rendimento e modo de preparo em `recipes`; composição por 100 g calculada no servidor (soma dos ingredientes ÷ rendimento) e gravada em `food_nutrients` | gatilho `recipes_guard` + `foods.js` |
| `POST/PUT /rafanutri/foods[/:id]` (valores por 100 g ou pela porção do rótulo, convertidos), `POST /rafanutri/foods/:id/archive`, `POST/PUT /rafanutri/recipes[/:id]`, `GET /rafanutri/recipes/:id` — transação, consultório do próprio usuário | extensão `rafanutri` |

Nutrientes informados: energia (obrigatória), proteínas, carboidratos, gorduras totais e saturadas, fibra e sódio. Limites por 100 g evitam erros de digitação (ex.: kJ no lugar de kcal; macros somando mais de 100 g).

## Orientações reutilizáveis (RN-045)

Migração `0014_text_snippets.sql` (**aplicada na vpsrafa em 12/11/2026**), testes em `db/tests/0014_text_snippets.test.sql` e no teste de isolamento. Sem permissão de coleção no Directus: leitura e gravação só pelos endpoints da extensão.

| Regra | Onde |
|---|---|
| Texto do consultório (`organization_id`) com categoria (2–40), título (2–80) e texto (2–2000), aparados | tabela `text_snippets` + gatilho `text_snippets_guard` |
| Texto sem consultório = biblioteca da plataforma, só por seed (sem autor); aparece para todos, só leitura | gatilho `text_snippets_guard` |
| Autor owner/nutricionista do consultório; o texto não muda de consultório | gatilho `text_snippets_guard` |
| `GET /rafanutri/snippets` (biblioteca + consultório, com `own`), `POST`, `PUT /:id`, `DELETE /:id` — só no consultório do usuário logado | extensão `rafanutri` |

Apagar uma orientação não altera planos que já usam o texto (a orientação é copiada para o plano).

## Evoluções do prontuário (RN-023)

Migrações `0015_clinical_notes.sql` e `0016_clinical_notes_cascade.sql` (**aplicadas na vpsrafa em 13/11/2026**), testes em `db/tests/0015_*.test.sql`, `db/tests/0016_*.test.sql` e no teste de isolamento. Sem permissão de coleção no Directus: leitura e gravação só pelos endpoints da extensão.

| Regra | Onde |
|---|---|
| A evolução nasce como rascunho; só owner/nutricionista do consultório escreve, para paciente do próprio consultório | gatilho `clinical_notes_guard` |
| Assinar grava a hora do servidor, o nome e o CRN do autor (como estavam no momento); a assinatura nunca vem do cliente | gatilho `clinical_notes_guard` |
| Assinada não muda nem é apagada; corrigir = retificar (nova evolução com `supersedes_id`, mesmo paciente, cada versão retificada uma vez) | gatilho + índice único em `supersedes_id` |
| Só o autor edita, assina ou apaga o próprio rascunho; qualquer owner/nutricionista do consultório retifica | extensão `rafanutri` |
| Paciente ou consultório apagado pelo administrador leva as evoluções (cascata); consulta apagada só desfaz o vínculo | 0016 (`pg_trigger_depth()`) |
| `GET/POST /rafanutri/patients/:id/notes`, `PUT/DELETE /rafanutri/notes/:id`, `POST /rafanutri/notes/:id/sign` (conflito → 409 com a mensagem do banco) | extensão `rafanutri` |

A leitura do prontuário é registrada na auditoria (RN-009, `log_access`).

## Plano gratuito e lista de interesse (RN-200 a RN-202)

Migração `0017_plan_waitlist.sql` (**aplicada na vpsrafa em 14/11/2026**), testes em `db/tests/0017_plan_waitlist.test.sql` e no teste de isolamento.

| Regra | Onde |
|---|---|
| Plano do consultório em `organizations.plan` (só `free` no MVP: 20 pacientes ativos, 1 profissional). A tabela `subscriptions` do plano original fica para a cobrança (RN-057) | `plans` (0002) |
| Limite de pacientes ativos no banco, com trava por consultório contra cadastros simultâneos; reativar ocupa vaga | gatilho `enforce_active_patient_limit` (0004) + gancho com a mensagem "Você atingiu o limite de 20 pacientes ativos do plano Gratuito" |
| Interesse no plano pago: um por consultório, só o owner registra, guarda o plano desejado e o uso no momento | `plan_waitlist` + gatilho `plan_waitlist_guard` |
| `GET /rafanutri/plan` (plano, uso e interesse do próprio consultório) e `POST /rafanutri/plan/waitlist` | extensão `rafanutri` |

## Recomendações ao paciente (RN-208)

Migração `0020_patient_recommendations.sql` (idempotente; testes em `db/tests/0020_patient_recommendations.test.sql`):

- `patient_recommendations` (categoria, título, texto ≤ 4.000, `pinned`, `status` `draft`/`published`, `published_at`, `read_at`). Só owner/nutricionista cria, para paciente ativo do consultório.
- `read_at` só muda com a variável de sessão `rafanutri.patient_read` (endpoint do paciente), uma vez, em recomendação publicada e sem alterar mais nada. Editar título/texto de uma publicada ou voltar para rascunho zera a leitura.

| Endpoint | Quem |
|---|---|
| `GET`/`POST /rafanutri/patients/:id/recommendations` (`{ items: [...], publish }` cria várias), `PUT`/`DELETE /rafanutri/recommendations/:id` | profissional |
| `GET /rafanutri/me/patient/recommendations[?c=]`, `POST /rafanutri/me/patient/recommendations/:id/read` | paciente (só publicadas) |

`GET /rafanutri/me/patient` passa a trazer `recommendations_unread` por registro.

## Expediente do consultório (RN-022)

Migração `0031_work_schedule.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0031_work_schedule.test.sql`): `organizations.work_start`, `work_end` (padrão 08:00–18:00, fim depois do início) e `work_weekdays` (ISO 1–7, padrão todos). Gravado por `PUT /rafanutri/practices/:id/schedule` (owner); lido em `/rafanutri/me/organizations`. A página pública (0029) mantém o próprio horário.

## Módulo UAN: unidades e equipe (RN-121 a RN-123)

Migração `0033_uan_units.sql` (testes em `db/tests/0033_uan_units.test.sql`):

- `organizations.modules` (`{clinical}` por padrão; `{clinical,uan}` habilita a UAN) e `org_has_module(org, módulo)`.
- `organization_contracts` (plano `uan_pilot`/`uan_quality`/`uan_complete`, unidades contratadas, preço, vigência e recursos) e `uan_unit_limit(org)`: unidades ativas do contrato vigente; sem contrato, 1.
- `production_units`: nome, tipo, CNPJ (14 dígitos), endereço, cidade/UF, latitude/longitude e raio, alvará sanitário e validade, ativa. O gatilho `production_units_guard` exige o módulo, respeita o limite (com trava por organização) e impede mudar de organização. Alterações entram na auditoria.
- `unit_members (unidade, usuário, papel)`: `technical_lead` (um por unidade), `manager`, `cook`, `stock_keeper`, `auditor`. `has_unit_role(unidade, usuário, papéis)`: o owner da organização tem todos.

A equipe da UAN fica **só** em `unit_members`, nunca em `organization_members`. Assim, nenhuma regra clínica ou financeira (que olha `organization_members`) alcança cozinheiros e estoquistas. As tabelas não têm permissão no Directus; tudo passa pelos endpoints:

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/context` | Empresas com UAN em que o usuário atua, com as unidades que ele vê, os papéis e o limite (owner) |
| `POST /rafanutri/uan/units` | Owner da empresa (409 no limite do contrato) |
| `GET /rafanutri/uan/units/:id` | Owner ou equipe da unidade; a equipe é listada só para owner, gestor e RT |
| `PUT /rafanutri/uan/units/:id` | Owner ou gestor; ativar e desativar, só o owner |

Habilitar a UAN numa organização (admin, por SQL, até existir a cobrança Enterprise):

```sql
update organizations set modules = '{clinical,uan}' where id = '<org>';
insert into organization_contracts (organization_id, plan, units_contracted) values ('<org>', 'uan_pilot', 2);
```

### Convite da equipe por link (RN-220)

Migração `0034_unit_invites.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0034-2026-11-15.dump`; testes em `db/tests/0034_unit_invites.test.sql`):

- `unit_invites`: unidade, papel, rótulo opcional ("para quem"), hash SHA-256 do token, validade de no máximo 7 dias, uso único, revogável; só unidades ativas. O gatilho `unit_invites_guard` confere quem convida: o owner convida para qualquer papel; gestor e RT da unidade, só cozinheiro, estoquista e auditor. Até 30 convites pendentes por unidade. O convite não muda depois de criado (só uso ou revogação, uma vez).
- `unit_invite_accept(hash, usuário)`: trava o convite, grava o papel em `unit_members` e marca o uso na mesma transação. Devolve a unidade; `null` se vencido, usado, revogado ou unidade inativa. Se a unidade já tem RT, recusa sem consumir o convite.
- Auditoria: `unit_invites` e `unit_members` (entrada, troca de papel e saída) entram na trilha da organização.

| Endpoint | Quem |
|---|---|
| `POST /rafanutri/uan/units/:id/invites` (`{ role, label }`) | Owner (qualquer papel); gestor e RT (cozinheiro, estoquista, auditor). Devolve o token uma única vez |
| `POST /rafanutri/uan/units/:id/invites/:inviteId/revoke` | Quem pode convidar para aquele papel |
| `POST /rafanutri/uan/units/:id/members` (`{ user_id, role, new_role }`; sem `new_role`, remove) | Mesma regra de papéis; um RT por unidade (409) |
| `POST /rafanutri/public/unit-invites/open` | Público: empresa, unidade, tipo, papel e validade (sem ids) |
| `POST /rafanutri/public/unit-invites/accept` (`{ token, full_name, email, password }`) | Público: cria a conta (papel do cadastro público) e entra na unidade; e-mail já cadastrado → 409 `ACCOUNT_EXISTS` |
| `POST /rafanutri/unit-invites/accept` | Conta logada (não aceita conta de paciente) |

`GET /rafanutri/uan/units/:id` passa a trazer `can_manage_team`, `invitable_roles` e os convites pendentes (para owner, gestor e RT). Quem só está na equipe da UAN (sem consultório) entra direto em `/app/uan`.

## Checklists de Boas Práticas (U1a)

Migração `0035_checklists.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0035-2026-11-15.dump`; testes em `db/tests/0035_checklists.test.sql`):

- `checklist_templates` e `checklist_template_items`: modelos da **plataforma** (`organization_id` nulo, com `code`; só leitura) ou da organização (editor ainda por vir). Itens do tipo `compliance` (conforme, não conforme, não se aplica) ou `number` (valor medido com mínimo e máximo; fora do limite = não conforme), crítico e foto obrigatória na falha.
- Biblioteca inicial (função `seed_platform_checklist`, idempotente): `rdc-216` (58 itens, 7 críticos, textos do BPF Check corrigidos), `abertura-cozinha` (9 itens, com geladeira até 5 °C e freezer até −18 °C) e `higiene-manipuladores` (8 itens). A RT revisa antes do piloto.
- `checklist_runs`: execução por unidade, com `client_id` único (idempotente, preparado para o offline), localização e distância até a unidade (`geo_distance_m`), pontuação e contagens. `checklist_start` cria a execução e **copia** os itens para `checklist_answers`; mudar o modelo depois não altera execuções.
- `checklist_answers`: o texto copiado não muda; resposta só com a execução em andamento. `checklist_complete` exige todas as respostas e, em item crítico não conforme, foto e comentário; calcula `score` = conformes ÷ (conformes + não conformes) e abre uma não conformidade por item crítico.
- `non_conformities`: origem (checklist, temperatura, recebimento, manual), severidade, prazo padrão (`nc_due`: crítica 24 h, alta 72 h, média 7 dias, baixa 15 dias), foto.
- Execuções, não conformidades e modelos entram na auditoria.

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/units/:id/checklists` | Equipe da unidade: modelos, últimas execuções, não conformidades abertas, `can_run` |
| `POST /rafanutri/uan/units/:id/checklist-runs` (`{ template_id, client_id, geo_lat, geo_lng, geo_accuracy_m }`) | Owner, RT, gestor, cozinheiro, estoquista (o auditor só consulta) |
| `GET /rafanutri/uan/checklist-runs/:id` | Equipe da unidade |
| `PUT /rafanutri/uan/checklist-runs/:id/answers/:position` (`{ value }` ou `{ number_value }`, `comment`) | Quem executa |
| `POST`/`GET /rafanutri/uan/checklist-runs/:id/answers/:position/photo` | Executa / equipe da unidade (JPG ou PNG até 600 KB; no app, pelo proxy `/api/uan/checklists/:id/foto/:posição`) |
| `POST /rafanutri/uan/checklist-runs/:id/complete`, `/cancel` | Quem executa; cancelar: quem iniciou, gestor, RT ou owner |

Migração `0040_checklist_signature.sql` (aplicada em 15/11/2026): `checklist_runs.signature` (PNG) e `signed_by`, gravados por `POST /rafanutri/uan/checklist-runs/:id/signature` só com o checklist em andamento; lidos por `GET …/signature` (no app, `/api/uan/checklists/:id/assinatura`).

Migração `0041_offline_answers.sql` (aplicada em 15/11/2026, backup `antes-0041-2026-11-15.dump`): no modo offline (RN-149) o app envia `answered_at` com o horário do aparelho; o gatilho das respostas aceita se estiver entre 72 h atrás e 5 min à frente (limitado a agora); fora disso, usa o horário do servidor.

### Editor de modelos e agenda (RN-147, RN-150)

Migração `0038_checklist_editor.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0038-2026-11-15.dump`; testes em `db/tests/0038_checklist_editor.test.sql`):

- Modelos e itens da biblioteca são só leitura (gatilho `checklist_platform_guard`; a carga marca `rafanutri.seed`). `checklist_template_copy(modelo, empresa, usuário)` copia para a empresa (nome "— personalizado"; `source_template_id` guarda a origem).
- Apagar item de um modelo zera só `checklist_answers.item_id` das respostas já gravadas (também em checklists concluídos).
- `checklist_schedules`: unidade, modelo, dias ISO (1 = segunda), horário, tolerância (15 a 720 min). `checklist_day(unidade, instante)` devolve os agendados do dia (fuso de São Paulo) com a situação: `done`, `in_progress`, `pending`, `overdue`.

| Endpoint | Quem |
|---|---|
| `POST /rafanutri/uan/units/:id/checklist-templates/copy` | Owner, gestor, RT |
| `GET /rafanutri/uan/checklist-templates/:id` | Quem atua em alguma empresa com UAN (modelo da empresa: só quem é dela) |
| `PUT /rafanutri/uan/checklist-templates/:id` (dados e `items`, substitui todos) | Owner da empresa, gestor ou RT de alguma unidade dela |
| `POST /rafanutri/uan/units/:id/checklist-schedules`, `DELETE /rafanutri/uan/checklist-schedules/:id` | Owner, gestor, RT |

`GET /rafanutri/uan/units/:id/checklists` passa a trazer `today`, `schedules` (para quem supervisiona), `can_manage` e `editable` por modelo.

## Equipamentos e temperaturas (RN-151)

Migração `0036_temperatures.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0036-2026-11-15.dump`; testes em `db/tests/0036_temperatures.test.sql`):

- `equipment`: unidade, nome, tipo, limites mínimo e máximo, intervalo de leitura (horas), em uso. Sem limites informados, o gatilho aplica `equipment_default_limits(tipo)` (RDC 216/2004: geladeira, câmara e balcão refrigerado até 5 °C; freezer e câmara de congelados até −18 °C; balcão quente a partir de 60 °C). Não muda de unidade.
- `temperature_readings`: de um equipamento **ou** de um alimento (`food_stage` + `food_name`, limites de `food_stage_limits`: cocção e reaquecimento ≥ 70 °C, distribuição quente ≥ 60 °C, fria ≤ 5 °C, fim do resfriamento ≤ 10 °C). O limite é copiado na leitura; `out_of_range` é calculado; fora do limite exige `corrective_action`. Leituras não se alteram nem se apagam. `client_id` único (idempotente); `seq` ordena leituras com o mesmo horário.
- Duas leituras seguidas fora do limite no mesmo equipamento abrem uma não conformidade **alta** (72 h), ligada ao equipamento (`non_conformities.equipment_id`), se não houver outra aberta para ele.

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/units/:id/temperatures` | Equipe da unidade: equipamentos com a última leitura e `overdue`, últimas leituras de alimentos |
| `POST /rafanutri/uan/units/:id/equipment`, `PUT /rafanutri/uan/equipment/:id` | Owner, gestor ou RT |
| `GET /rafanutri/uan/equipment/:id?days=30` | Equipe da unidade (até 90 dias, 500 leituras) |
| `POST /rafanutri/uan/units/:id/temperatures` (`{ equipment_id }` ou `{ food_stage, food_name }`, `value`, `corrective_action`, `client_id`) | Quem executa checklists |

## Não conformidades e plano de ação 5W2H (RN-153, RN-154)

Migração `0037_action_plans.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0037-2026-11-15.dump`; testes em `db/tests/0037_action_plans.test.sql`):

- Ciclo da NC: **aberta** → **em tratamento** (ao ganhar um plano) → **resolvida** (todos os planos concluídos) → **fechada**. A situação muda só pelos gatilhos dos planos e por `nc_close`; ninguém a força por update.
- `action_plans`: o quê, por quê, onde (`where_`), quando (`due_date`), quem (`who_user` da equipe ou `who_text`), como, quanto (`how_much_cents`). Concluído não muda nem se apaga; NC fechada não recebe plano.
- `nc_close(nc, usuário, nota, foto)`: exige a NC resolvida, a nota de verificação de eficácia e a foto (`closing_photo`). Fechada é definitiva.

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/units/:id/non-conformities` | Equipe da unidade (abertas e fechadas nos últimos 30 dias, com contagem de ações) |
| `POST /rafanutri/uan/units/:id/non-conformities` (`{ title, description, severity, image }`) | Quem executa checklists |
| `GET /rafanutri/uan/non-conformities/:id`, `GET …/photo/opening\|closing` | Equipe da unidade |
| `POST /rafanutri/uan/non-conformities/:id/plans`, `DELETE /rafanutri/uan/action-plans/:id` | Owner, gestor, RT |
| `POST /rafanutri/uan/action-plans/:id/done` | O responsável pela ação ou quem supervisiona |
| `POST /rafanutri/uan/non-conformities/:id/close` (`{ note, image }`) | Owner ou RT |

## Painel de conformidade (RN-165)

Migração `0039_compliance.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0039-2026-11-15.dump`; testes em `db/tests/0039_compliance.test.sql`): `uan_compliance(unidade, dias = 30, pesos)` devolve `{ index, components, weights, counts }`.

| Componente | Peso | Cálculo |
|---|---|---|
| `schedule` | 30 | Ocorrências da agenda em dias anteriores a hoje (desde a criação da agenda) com checklist concluído no mesmo dia |
| `score` | 30 | Média da pontuação dos checklists concluídos no período |
| `temperature` | 20 | Leituras dentro do limite ÷ leituras do período |
| `deadlines` | 20 | 100 − 20 por não conformidade aberta com prazo vencido (mínimo 0) |

Componente sem dados fica de fora e os pesos se redistribuem; sem nenhum, `index` é nulo. `counts` traz as pendências (NCs atrasadas, checklists atrasados hoje, equipamentos sem leitura no prazo). `GET /rafanutri/uan/compliance?days=30` (7 a 90) devolve o índice de cada unidade ativa: o owner vê todas as da empresa; a equipe, só as dela.

## Insumos, fornecedores e preços (U2a: RN-125 a RN-128)

Migração `0042_ingredients.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0042-2026-11-15.dump`; testes em `db/tests/0042_ingredients.test.sql`). Tudo é da empresa (organização), compartilhado pelas unidades; exige o módulo UAN.

- `ingredients`: nome (único na empresa, sem caixa e espaços), categoria, `food_id` (base pública TACO/TBCA), `default_fc` (≥ 1), unidade de compra (`kg`, `g`, `l`, `ml`, `un`, `dz`, `cx`, `pct`) com `density_g_ml`, `unit_weight_g` (obrigatório em un/dz) e `pack_grams` (obrigatório em cx/pct), armazenamento, estoque mínimo, `allergens` (códigos de `uan_allergen_codes()`: RDC 26/2015 + lactose), ativo.
- `suppliers`: nome único na empresa, CNPJ (14 dígitos), contato, telefone, e-mail, observações, ativo.
- `ingredient_prices`: preço (centavos) por unidade de compra, fornecedor da mesma empresa, `valid_from`, origem (manual, recebimento, planilha). Imutável; apagar o fornecedor só zera a referência. `ingredient_price_at(insumo, data)` = maior vigência até a data (empate: o último registrado).

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/foods?q=` | Quem atua em alguma empresa com UAN (só base pública) |
| `GET`/`POST /rafanutri/uan/organizations/:id/ingredients`, `GET`/`PUT /rafanutri/uan/ingredients/:id` | Ver: owner e equipe; cadastrar: owner, gestor, RT, estoquista |
| `POST /rafanutri/uan/ingredients/:id/prices` (`{ price, supplier_id, valid_from }`) | Owner, gestor, RT, estoquista |
| `GET`/`POST /rafanutri/uan/organizations/:id/suppliers`, `PUT /rafanutri/uan/suppliers/:id` | Idem |

## Fichas técnicas (U2b: RN-129 a RN-134)

Migração `0043_tech_sheets.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0043-2026-11-15.dump`; testes em `db/tests/0043_tech_sheets.test.sql`). Tabelas `tech_sheets*` (o nome `recipes` é da biblioteca de receitas do clínico).

- `tech_sheets`: nome, categoria, porções, peso pronto ou IC, tempo, equipamentos, observações, `status` (`draft`, `approved`, `archived`), `version`, `parent_id`, `root_id` (família de versões), `computed` (cálculo gravado na aprovação).
- `tech_sheet_items`: insumo (peso bruto e FC próprio ou o do insumo) **ou** sub-receita (peso da preparação pronta usada); o gatilho recusa insumo/sub-receita de outra empresa e **ciclo** de sub-receitas. `tech_sheet_steps`: texto, ponto crítico, temperatura alvo.
- Aprovada é imutável (dados, itens e passos); só pode ir para arquivada. `tech_sheet_approve(ficha, usuário, computed)` exige RT de alguma unidade da empresa ou owner e arquiva a aprovada anterior da mesma raiz. `tech_sheet_new_version(ficha, usuário)` cria o rascunho seguinte (um por vez) copiando itens e passos.
- Cálculos no app com `@rafanutri/nutrition-core` (`techsheet.ts`); preço por kg vigente e nutrientes por 100 g vêm do endpoint.

| Endpoint | Quem |
|---|---|
| `GET`/`POST /rafanutri/uan/organizations/:id/tech-sheets` | Ver: owner e equipe; criar: owner, gestor, RT |
| `GET /rafanutri/uan/tech-sheets/:id` (ficha, grafo com sub-receitas, insumos, passos, versões, catálogo) e `…/graph` | Equipe da empresa; preço e `computed` só para owner, gestor, RT e estoquista |
| `PUT /rafanutri/uan/tech-sheets/:id` (dados, `items`, `steps`; substitui) | Owner, gestor, RT; só rascunho |
| `POST …/approve` (`{ computed }`), `…/new-version`, `…/duplicate`; `DELETE` (rascunho que não é sub-receita) | Aprovar: owner ou RT; o resto: owner, gestor, RT |

## Cardápio cíclico e aprovação (U2c: RN-135, RN-136, RN-224)

Migração `0044_menus.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0044-2026-11-15.dump`; testes em `db/tests/0044_menus.test.sql`):

- `menu_cycles`: unidade, nome, início, duração (7 a 56 dias), `services` (desjejum, colação, almoço, lanche, jantar, ceia), `slots` (composição do prato), teto de custo por refeição, `status` (`draft`, `submitted`, `approved`), justificativa.
- `menu_items`: dia, serviço, posição e `sheet_root_id` (raiz da ficha técnica; o cardápio usa a versão aprovada mais recente). Só ficha aprovada da empresa; dia, serviço e posição do ciclo.
- `menu_approvals`: histórico (enviado, aprovado, devolvido, reaberto) com o resultado da conferência de custo.
- `menu_transition(ciclo, usuário, 'submit'|'approve'|'return', nota, cost_check)`; status só por ela. Mudar item ou dados de cardápio enviado/aprovado volta para rascunho e registra "reaberto". `menu_day_index(ciclo, data)`.

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/units/:id/menus` (ciclos e cardápio de hoje) | Equipe da unidade (cozinheiro, estoquista e auditor: só aprovados) |
| `POST /rafanutri/uan/units/:id/menus`, `PUT /rafanutri/uan/menus/:id`, `PUT …/items`, `POST …/duplicate` | Owner, gestor, RT |
| `GET /rafanutri/uan/menus/:id` (itens, opções, custo por refeição, histórico) | Idem; custo para quem supervisiona e estoquista |
| `POST …/submit` (acima do teto exige justificativa ≥ 10 caracteres; erro `COST_OVER`) | Owner, gestor, RT |
| `POST …/approve`, `…/return` (com nota) | Owner ou gestor |

## Produção do dia e desperdício (U3a: RN-137, RN-225 a RN-227)

Migração `0045_production.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0045-2026-11-15.dump`; testes em `db/tests/0045_production.test.sql`):

- `diner_counts (unidade, dia, serviço)`: `planned` e `actual`.
- `waste_records`: um por unidade, dia, serviço e preparação (`sheet_root_id`; nulo = serviço inteiro). Por preparação: `produced_g`, `leftover_g` (sobra limpa ≤ produzido), `portions_served`; por serviço: `plate_waste_g` (resto-ingesta). `prep_waste_g`, `reason` (sabor, temperatura, porção, apresentação, repetido, excesso de produção, outro), observações. Hora do servidor; dia futuro é recusado; registrar a mesma chave substitui.
- Cálculos no app (`nutrition-core/production.ts`): porções = comensais previstos × adesão média de 30 dias; requisição consolidada; indicadores de desperdício.

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/units/:id/production?date=` | Equipe da unidade (preço só para quem supervisiona e estoquista) |
| `POST /rafanutri/uan/units/:id/diners` (`{ day, service, planned, actual }`), `POST …/diners/pattern` (`{ from, to, weekdays, service, planned }`) | Owner, gestor, RT |
| `PUT /rafanutri/uan/units/:id/waste` | Quem executa (owner, RT, gestor, cozinheiro, estoquista) |

## Estoque por lote com FEFO e inventário (U4a: RN-142 a RN-145)

Migração `0046_stock.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0046-2026-11-15.dump`; testes em `db/tests/0046_stock.test.sql`). Quantidades em gramas; a tela converte para a unidade de compra.

- `stock_lots` (saldo nunca negativo) e `stock_movements` (`in`, `out_production`, `out_loss`, `adjustment`): só pelas funções (gatilho `stock_fn_guard`).
- `stock_receive(unidade, insumo, gramas, lote, validade, fornecedor, custo/kg, usuário, ref)`; `stock_out_fefo(unidade, insumo, gramas, tipo, motivo, usuário, ref)` trava os lotes do insumo, falha se faltar saldo e consome pela validade mais próxima (sem validade por último). Visão `stock_balance`.
- `inventories` e `inventory_counts`: `inventory_open` guarda o saldo de cada insumo; `inventory_approve` (RT da unidade ou owner) exige motivo nas divergências e lança os ajustes.

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/units/:id/stock` | Equipe da unidade |
| `POST …/stock/in` (`{ ingredient_id, quantity, lot_code, expires_on, supplier_id, cost }`), `POST …/stock/out` (`{ kind, reason, lines: [{ ingredient_id, quantity | quantity_g }] }`) | Owner, gestor, RT, estoquista |
| `POST /rafanutri/uan/units/:id/inventories`, `GET /rafanutri/uan/inventories/:id`, `PUT …/counts`, `POST …/cancel` | Idem (saldo do sistema só aparece para quem aprova) |
| `POST /rafanutri/uan/inventories/:id/approve` | RT da unidade ou owner |

### Pedido de compra e recebimento (U4b: RN-139 a RN-141)

Migração `0047_purchasing.sql` (**aplicada na vpsrafa em 15/11/2026**, backup `antes-0047-2026-11-15.dump`; testes em `db/tests/0047_purchasing.test.sql`): `purchase_orders` (rascunho → enviado → recebido/cancelado; itens só no rascunho), `purchase_order_items` (unidade de compra, preço, recebido), `goods_receipts` e itens. `receive_order(pedido, usuário, nota, obs, itens)` só para pedido enviado: aceitos viram lote (`stock_receive`) e preço (`ingredient_prices`, origem recebimento); recusados exigem motivo e abrem não conformidade (`source = 'receiving'`).

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/uan/units/:id/purchase-needs?from=&to=` (até 31 dias) | Owner, gestor, RT, estoquista |
| `GET`/`POST /rafanutri/uan/units/:id/purchase-orders` (`{ orders: [...] }`), `GET`/`PUT /rafanutri/uan/purchase-orders/:id`, `POST …/send`, `…/cancel`, `…/receive` | Idem |

## Custos planejado × realizado (U5: RN-229)

Sem migração: `GET /rafanutri/uan/units/:id/costs?from=&to=` (até 31 dias; owner, gestor, RT, estoquista) devolve o plano do período (o mesmo da necessidade de compra: cardápios aprovados, comensais previstos e realizados, fichas, adesão) e `consumption`: retiradas `out_production` por dia e insumo, valorizadas pelo custo do lote (`cost_per_kg_cents`); sem custo no lote, pelo preço vigente do insumo (`estimated`). O campo `criterion` registra esse critério. Os indicadores (custo por refeição, diferença, desvio por produto, curva ABC) são calculados no app com `nutrition-core/costs.ts`.

## Documentos de BPF, ciência e treinamentos (U6a: RN-155, RN-156, RN-158, RN-159)

Migração `0048_quality_docs.sql` (**aplicada na vpsrafa em 18/11/2026**, backup `antes-0048-2026-11-18.dump`; testes em `db/tests/0048_quality_docs.test.sql`):

- `quality_documents` (por unidade: POP, manual ou outro; revisão a cada N meses) e `quality_document_versions` (Markdown; um rascunho por documento; aprovada é imutável e guarda `content_hash` = SHA-256 do texto, com `sha256()` nativo, e `next_review_on`). `doc_version_approve(versão, usuário)`: RT da unidade ou owner. Visão `quality_document_current` (vigente = aprovada de maior número).
- `document_acknowledgements (versão, usuário)`: ciência da equipe.
- `trainings` e `training_attendees` (usuário da equipe ou nome livre).

Endpoints (publicados em 18/11/2026): `GET/POST /rafanutri/uan/units/:id/documents` (criar: owner, gestor ou RT), `GET /rafanutri/uan/documents/:id` (qualquer membro da unidade; rascunho e lista de ciência só para quem edita), `PUT …/draft`, `POST …/approve` (RT ou owner), `POST …/acknowledge` (qualquer membro, só versão aprovada), `GET/POST /rafanutri/uan/units/:id/trainings`. Coleções sem acesso direto pela API de itens; cenário no teste de isolamento.

## Integridade dos registros (U6b: RN-167)

Migração `0049_integrity.sql` (**aplicada na vpsrafa em 18/11/2026**, backup `antes-0049-0054-2026-11-18.dump`; testes em `db/tests/0049_integrity.test.sql`):

- `checklist_runs.content_hash`: SHA-256 de um texto canônico da execução e das respostas (`checklist_run_canonical`/`checklist_run_digest`; datas em epoch, sem ids de usuário). Gravado por `checklist_complete`; os 26 checklists já concluídos em produção receberam o hash na migração (0 divergências).
- `uan_integrity_check(unidade, de, até)`: recalcula os hashes de checklists concluídos e versões aprovadas de documento e devolve `ok` por registro (o dossiê usa). Adulteração direta no banco aparece como divergência.
- `uan_no_delete()`: registros de qualidade (checklists e respostas, temperaturas, não conformidades, treinamentos e participantes, ciência, recebimentos, movimentos de estoque, sobras, comensais e emissões) não se apagam; só somem em cascata com a unidade ou a empresa.
- Auditoria em `organization_contracts`, `stock_lots` e `stock_movements`.
- Correção: apagar a conta de quem respondeu ou concluiu um checklist fechado falhava (o guarda recusava o `set null` da FK). Agora a FK pode zerar a referência (só pela ação da FK, nunca por UPDATE direto).

## APPCC (U7: RN-160, RN-161)

Migração `0050_haccp.sql` (**aplicada em 18/11/2026**; testes em `db/tests/0050_haccp.test.sql`):

- `haccp_plans` (por unidade, opcionalmente de uma ficha; versões com `root_id`; rascunho editável, aprovado imutável, anterior arquivado), `haccp_steps` (fluxograma ordenado) e `haccp_hazards` (biológico, químico, físico, alergênico; severidade × probabilidade de 1 a 3, `risk` gerado; significativo a partir de 4 — matriz a validar).
- `haccp_decision(q1, q1b, q2, q3, q4)`: árvore decisória do Codex (`ccp`, `not_ccp`, `modify` ou null se incompleta), calculada no gatilho.
- `haccp_steps_from_sheet(plano)`: etapas a partir dos passos da ficha (com a temperatura-alvo). `haccp_plan_approve(plano, usuário)`: RT ou owner; exige árvore respondida nos perigos significativos e limite crítico, monitoramento e ação corretiva em cada PCC; numera os PCC. `haccp_plan_new_version`.
- O PCC pode apontar para um modelo de checklist ou um equipamento da mesma unidade (monitoramento).

## Rotulagem (U7: RN-162 a RN-164)

Migração `0051_labels.sql` (**aplicada em 18/11/2026**): `ingredients.added_sugar_g_100g` e `nutrition_labels` (retrato imutável do rótulo emitido de uma ficha aprovada: porção, medida caseira, valores em jsonb, lupa `added_sugar`/`saturated_fat`/`sodium`, alergênicos e declaração, formato; só arquiva). O cálculo (IN 75/2020) fica no nutrition-core.

## Perfis de público e regras do cardápio (U7: RN-221)

Migração `0052_menu_planning.sql` (**aplicada em 18/11/2026**):

- `diner_profiles`: perfil (PAT, PNAE, hospitalar, hotelaria, transportada, outro) com metas `{nutriente: {min, max, target}}`. Cinco perfis da plataforma, só leitura e **não validados**: PAT grande e pequena refeição (Portaria Interministerial 66/2006) e PNAE/hospitalar sem metas (a RT preenche na cópia). `diner_profile_copy`.
- `menu_rules`: insumo ou categoria vetados, prato obrigatório por dia, frequência máxima por semana, teto de custo; da empresa ou de um perfil.
- `menu_cycles.profile_id` e `autonomy` (`standardized`, `decentralized`, `free`); `unit_sheet_adjustments` (fator de per capita local da ficha da rede).

## Cardápio público e pesquisa de satisfação (U7: RN-223)

Migração `0053_public_menu.sql` (**aplicada em 18/11/2026**): `production_units.public_menu_token`/`public_menu_enabled` e `unit_public_menu_set(unidade, ligar, trocar)`; `satisfaction_surveys` (1 a 3 perguntas estrelas ou sim/não; uma ativa por unidade; perguntas não mudam depois de respostas) e `satisfaction_responses` (uma por aparelho, dia e prato; nota calculada; imutável).

## Licenças, Manual, dossiê e contrato (U6b/U7: RN-157, RN-166, RN-124)

Migração `0054_dossier_contract.sql` (**aplicada em 18/11/2026**):

- `unit_licenses`: alvará sanitário, certificado do RT, controle de pragas, limpeza do reservatório, bombeiros, outro — com validade e arquivo.
- `compliance_exports`: Manual (edição numerada por unidade) e dossiê (período até 366 dias) emitidos, com versões incluídas, resumo de integridade, arquivo e hash; imutável e sem delete.
- Contrato: `organization_contracts.billing_method`/`notes`, `contract_invoices` (período, valor, vencimento, situação, gateway; valor e período não mudam; paga ou cancelada é final) e `uan_contract_state(org)` = `active` | `read_only` (até 90 dias após o fim) | `ended` | `none`. O bloqueio de escrita no modo leitura e a cobrança no gateway ficam no endpoint (ainda não feitos).

Telas e endpoints publicados em 18/11/2026: APPCC (`/rafanutri/uan/units/:id/haccp`, `/rafanutri/uan/haccp/:id`, `…/from-sheet`, `…/approve`, `…/new-version`), rótulos (`/rafanutri/uan/tech-sheets/:id/labels`, `/rafanutri/uan/labels/:id`, `…/archive`), cardápio público (`/rafanutri/public/menus/:token`, `…/responses`, `/rafanutri/uan/units/:id/public-menu`, `/rafanutri/uan/units/:id/surveys`), licenças, integridade, dossiê, Manual e emissões (`/rafanutri/uan/units/:id/licenses|integrity|dossier|manual|exports`, `/rafanutri/uan/licenses/:id`). Perfis e regras: `/rafanutri/uan/organizations/:id/menu-planning`, `…/diner-profiles` (copiar ou criar), `/rafanutri/uan/diner-profiles/:id`, `…/menu-rules`, `/rafanutri/uan/menu-rules/:id/deactivate`; o detalhe do cardápio traz `planning` (perfil, regras, insumos de cada ficha). Ajuste local de per capita: `GET/PUT /rafanutri/uan/units/:id/sheet-adjustments` (fator vazio apaga); a produção e a necessidade de compras devolvem `adjustments`. Contrato: `GET /rafanutri/uan/organizations/:id/contract` (só o owner) e `contract_state` no `/rafanutri/uan/context`; com o contrato encerrado, toda escrita em `/rafanutri/uan/*` volta 403 `READ_ONLY`. Faturas são lançadas pelo admin (SQL) até integrar o gateway. As tabelas não têm coleção no Directus (a API de itens recusa).

## Fotos da ficha e da recusa (RN-129, RN-141)

Migração `0055_photos.sql` (**aplicada na vpsrafa em 19/11/2026**, backup `antes-0055-2026-11-19.dump`; testes em `db/tests/0055_photos.test.sql`): `tech_sheets.photo` (muda em qualquer situação da ficha; `POST/GET /rafanutri/uan/tech-sheets/:id/photo`) e `goods_receipt_items.photo` (a foto da recusa enviada no recebimento vai para o item e para a não conformidade aberta). Correções: ficha aprovada e itens recebidos aceitam o `set null` das FKs (conta, ficha mãe ou arquivo apagado), só pela ação da FK.

## Importação de planilhas (RN-169)

Sem migração: `POST /rafanutri/uan/organizations/:id/import/suppliers|ingredients|sheets` (linhas já validadas no app, até 1.000; cada linha numa transação própria; resultado `created`, `skipped` ou `error` com o motivo) e `…/import/foods-match` (melhor alimento público por `search_foods`, pontuação ≥ 0,6). Preço importado entra com `source = 'import'`; fornecedor citado no insumo é criado pelo nome se não existir; fichas entram como rascunho.

## Painel da rede e relatório mensal (RN-229)

Sem migração: `GET /rafanutri/uan/organizations/:id/network?month=AAAA-MM` (owner: todas as unidades ativas; gestor e RT: as suas) e `GET /rafanutri/uan/units/:id/monthly?month=` (owner, gestor, RT, auditor). Custo realizado = retiradas `out_production` × custo do lote (ou preço vigente por kg); refeições de `diner_counts`; sobra e resto de `waste_records`; satisfação de `satisfaction_responses`; conformidade de `uan_compliance`.

## Administrador da plataforma (RN-124)

Migração `0056_platform_admins.sql` (**aplicada na vpsrafa em 20/11/2026**, backup `antes-0056-2026-11-20.dump`; testes em `db/tests/0056_platform_admins.test.sql`): `platform_admins (user_id)` (vazia; inclusão só por SQL) e `is_platform_admin(usuário)` = listado ali ou com política `admin_access` do Directus. Endpoints `/rafanutri/admin/*` (`me`, `uan/organizations`, `uan/organizations/:id`, `…/module`, `…/contracts`, `uan/contracts/:id` PATCH, `…/invoices`, `uan/invoices/:id` PATCH) respondem 404 para quem não é admin. Tela em `/app/admin`.

## Aceite dos documentos legais

Migração `0057_terms_acceptances.sql` (**aplicada na vpsrafa em 20/11/2026**, backup `antes-0057-2026-11-20.dump`; testes em `db/tests/0057_terms_acceptances.test.sql`): `terms_acceptances (user_id, document professional_terms|patient_terms|privacy, version AAAA-MM-DD, accepted_at, user_agent)`, um por pessoa, documento e versão; não se altera nem se apaga (some com a conta). Endpoints `GET/POST /rafanutri/me/terms` (registra a versão vigente, `LEGAL_VERSIONS` na extensão = `apps/web/lib/legal/info.ts`). Os convites públicos (`/public/patient-invites/accept`, `/public/unit-invites/accept`) exigem `accept_terms: true` e gravam o aceite. Para publicar uma versão nova de um documento: mudar a data nos dois lugares; quem entrar depois aceita de novo.

## Feedback do beta (RN-047)

Migração `0032_feedback.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0032_feedback.test.sql`): `product_feedback` (consultório, autor, tipo `bug`/`idea`/`praise`/`other`, mensagem de 3 a 2.000 caracteres, caminho da página sem query string, status `new`/`read`/`done`). Gravado só por `POST /rafanutri/feedback` (qualquer conta logada, até 20 por dia); nenhum papel lê a coleção: o admin da plataforma consulta no Directus ou por SQL. Sem print de tela, porque a tela costuma ter dados de pacientes. O e2e grava mensagens com o prefixo `[e2e]`:

```sql
select date_created, kind, page, message from product_feedback where message not like '[e2e]%' order by date_created desc;
```

## Auditoria (RN-009)

Migração `0030_audit.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0030_audit.test.sql` e no teste de isolamento):

- `audit_logs` (consultório, autor, `insert`/`update`/`delete`/`read`/`export`, tabela, id, paciente, nomes dos campos alterados, horário). Sem coleção no Directus; não muda nem é apagado (só some em cascata com o consultório).
- `audit_trigger()` (AFTER, `security definer`) em `patients`, `clinical_notes`, `anamneses`, `anthropometric_assessments`, `meal_plans`, `clinical_documents`, `appointments`, `financial_transactions`, `receipts`, `organization_members`, `patient_app_invites`, `patient_recommendations` e `patient_packages`. Nunca grava valores; ignora `updated_at`/`date_updated`/`search_name` e alterações sem mudança.
- Autor: `rafanutri.actor` (endpoints da extensão, via `withActor`) ou `user_created` na inserção; escritas pela API de itens ficam sem autor e o endpoint resolve pelo `directus_activity` (índice `rafanutri_activity_item`).
- `log_access(org, autor, entidade, id, paciente, 'read'|'export')`: leitura das evoluções do paciente, exportação de documento clínico (PDF) e de recibo.
- Mesma linha (autor, item, ação, campos) em até 10 minutos não se repete (`audit_write`).

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/audit?from=&to=&actor=&entity=&action=&patient=&before=` (100 por página, mais recente primeiro; `next` é o cursor; `members` para o filtro) | owner |

## Página pública e agendamento online (RN-068)

Migração `0029_public_booking.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0029_public_booking.test.sql` e `db/tests/extension-booking.test.mjs`):

- `public_profiles` (uma por consultório; desligada por padrão; nutricionista da agenda precisa ser owner/nutricionista); `appointments.origin` (`manual`/`online_booking`).
- `booking_requests` (nome, e-mail, telefone E.164, modalidade, horário, mensagem, `pending`/`confirmed`/`declined`/`cancelled`). O gatilho trava por consultório e recusa horário ocupado por consulta (agendada, confirmada ou concluída) ou por outro pedido pendente (`booking_slot_taken`); horário no passado e página desligada também são recusados. Decidido não muda.

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/public/practices/:slug`, `…/logo`, `…/slots?from=&days=` | público (só com a página ligada) |
| `POST /rafanutri/public/practices/:slug/book` | público (campo-isca, 30 pedidos/dia por consultório, 2 pendentes por e-mail/telefone) |
| `GET`/`PUT /rafanutri/practices/:id/public-profile` | owner |
| `GET /rafanutri/booking-requests`, `POST /rafanutri/booking-requests/:id/confirm` \| `decline` | membros (confirmar/recusar: owner/nutricionista) |

## Indicadores do consultório (RN-064)

Migração `0028_dashboard.sql` (**aplicada na vpsrafa em 14/11/2026**; testes com dados conhecidos em `db/tests/0028_dashboard.test.sql`): `dashboard_month(org, data, nutricionista)` e `dashboard_indicators(org, data, nutricionista)` (json com o mês e o anterior, a receber, atrasado e retornos atrasados; definições no cabeçalho da migração). Lida só por `GET /rafanutri/dashboard?month=aaaa-mm&nutritionist=<id>`, que confere o consultório do usuário e só aceita nutricionista do próprio consultório.

## CRM (RN-056)

Migração `0027_crm.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0027_crm.test.sql` e `db/tests/extension-crm.test.mjs`):

- `leads` (nome, telefone E.164, e-mail, origem `instagram`/`referral`/`google`/`site`/`whatsapp`/`other`, etapa `new`/`contacted`/`lost`/`converted`, `lost_reason` obrigatório em perdido, `patient_id` ao converter). Qualquer membro cadastra; convertido não volta.
- `crm_events` (lead ou paciente, de/para, nota, `auto`, usuário de `rafanutri.actor`). Gatilhos registram toda mudança de etapa.
- `patients.crm_stage` (`scheduled`/`first_visit`/`follow_up`/`inactive`), `return_interval_days` (7–365, padrão 30), `lead_source`. `crm_refresh_patient()` roda depois de cada mudança em consultas; `crm_mark_inactive(org)` (90 dias sem consulta, nada marcado) é chamada pelo endpoint do quadro. A migração preencheu a etapa atual dos pacientes que já tinham consultas.

| Endpoint | O que faz |
|---|---|
| `GET /rafanutri/crm/board` | leads abertos (e perdidos dos últimos 90 dias) e pacientes ativos por etapa |
| `POST /rafanutri/crm/leads`, `PUT /rafanutri/crm/leads/:id` | cadastrar e editar lead |
| `POST /rafanutri/crm/leads/:id/stage` (`{ stage, note }`), `POST /rafanutri/crm/leads/:id/convert` | mover no funil; converter em paciente (respeita o limite do plano) |
| `GET /rafanutri/crm/returns?window=overdue\|7\|30` | retornos previstos sem consulta marcada |
| `PUT /rafanutri/patients/:id/return-interval` (`{ days }`) | intervalo de retorno do paciente |
| `GET /rafanutri/crm/metrics?days=` | leads por origem, convertidos, 1ª consulta e perdidos |

## Pacotes de consultas (RN-054)

Migração `0026_packages.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0026_packages.test.sql` e `db/tests/extension-finance.test.mjs`):

- `service_packages` (catálogo: nome, sessões 1–100, preço em centavos, validade em dias opcional, ativo); `patient_packages` (venda: cópia do nome, sessões e preço; `sessions_used`; `expires_at`; `status` active/finished/expired/cancelled); `appointments.patient_package_id`; `financial_transactions.patient_package_id`.
- Gatilhos em `appointments`: ao concluir sem pacote, liga ao pacote ativo mais antigo do paciente com sessão sobrando; pacote de outro paciente, cancelado, cheio ou vencido é recusado; depois de qualquer mudança de status, `refresh_patient_package()` reconta as sessões (conclusão desfeita devolve a sessão) e a situação é recalculada.
- `expire_patient_packages(org)`: marca os vencidos; os endpoints chamam antes de ler (não há cron).

| Endpoint | O que faz |
|---|---|
| `GET`/`POST /rafanutri/packages`, `PUT /rafanutri/packages/:id` | catálogo (criar/alterar só owner/nutricionista) |
| `GET`/`POST /rafanutri/patients/:id/packages` (`{ package_id, installments 1–12, first_due_date, paid_now, payment_method }`) | pacotes do paciente; venda gera as parcelas (categoria "Pacote") |
| `POST /rafanutri/patient-packages/:id/cancel` | cancela o pacote e as parcelas em aberto |
| `GET /rafanutri/packages/agenda?patients=` | pacote ativo de cada paciente (aviso da agenda) |

## Recibos (RN-055)

Migração `0025_receipts.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0025_receipts.test.sql`):

- `organizations.receipt_tax_id` (CPF ou CNPJ, só dígitos).
- `receipts`: número por consultório (`unique (organization_id, number)`, preenchido pelo gatilho com `next_receipt_number(org)`, que trava por consultório até o fim da transação), cópia dos dados no momento da emissão, valor e data vindos do lançamento (o cliente não forja). Só de receita paga do consultório, um por lançamento; não muda nem é apagado (só na cascata do consultório). `transaction_id` com `on delete no action`: lançamento com recibo não é excluído.
- Corrige a 0024: a trava "só owner/nutricionista exclui" deixa passar a cascata quando o consultório é apagado.

| Endpoint | O que faz |
|---|---|
| `POST /rafanutri/finance/transactions/:id/receipt` (`{ payer_name?, payer_cpf?, service? }`) | emite ou devolve o recibo já emitido |
| `GET /rafanutri/finance/receipts/:id` | dados do recibo para o PDF (`/app/financeiro/recibos/:id/pdf`) |
| `PUT /rafanutri/practices/:id/brand` (`{ receipt_tax_id }`) | CPF/CNPJ do emitente (owner) |

## Financeiro (RN-053)

Migração `0024_finance.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0024_finance.test.sql` e `db/tests/extension-finance.test.mjs`):

- `financial_categories`: padrão da plataforma (sem consultório: Consulta, Retorno, Pacote, Outros recebimentos, Aluguel, Software, Marketing, Impostos, Material, Outras despesas) e do consultório (owner/nutricionista cria).
- `financial_transactions`: `kind` (`income`/`expense`), categoria do mesmo tipo, `amount_cents` (inteiro > 0), `due_date`, `status` (`open`/`paid`/`cancelled`; pago ⇔ `paid_at`), `payment_method`, `patient_id` e `appointment_id` (só receita, do mesmo consultório; a consulta precisa ser do paciente), `notes`. Um recebimento não cancelado por consulta. Qualquer membro lança e edita; **excluir** exige `rafanutri.actor` (definido pelo endpoint na transação) de owner/nutricionista.
- View `monthly_cash_flow` (regime de caixa: pagos, pelo mês do pagamento).

| Endpoint | O que faz |
|---|---|
| `GET`/`POST /rafanutri/finance/categories` | categorias (padrão + do consultório) |
| `GET /rafanutri/finance/transactions?from=&to=&kind=&status=&patient=` | lançamentos por vencimento no período (padrão: mês atual) e `can_delete` |
| `POST`/`PUT`/`DELETE /rafanutri/finance/transactions[/:id]` | lançar, editar, excluir (assistente recebe 403) |
| `GET /rafanutri/finance/summary?month=aaaa-mm` | 6 meses de caixa e contas a receber (atrasadas à parte) |
| `GET /rafanutri/finance/appointment/:id` | pré-preenchimento do "Registrar pagamento" |

## Marca do consultório (RN-204)

Sem migração (`organizations.logo` e `brand_color` vêm da 0002). Só o owner do consultório muda:

| Endpoint | O que faz |
|---|---|
| `POST /rafanutri/practices/:id/logo` (`{ image: dataURL }`, PNG ou JPEG até 600 KB, assinatura conferida) | grava o arquivo em `directus_files` e troca o logo (o anterior é apagado) |
| `DELETE /rafanutri/practices/:id/logo` | remove o logo |
| `PUT /rafanutri/practices/:id/brand` (`{ brand_color: "#RRGGBB" }`) | troca a cor |

`GET /rafanutri/me/organizations` passa a trazer `has_logo`. A leitura continua em `GET /rafanutri/practices/:id/logo` (membros e pacientes com vínculo ativo).

## Documentos clínicos com a marca (RN-215)

Migração `0023_clinical_documents.sql` (**aplicada na vpsrafa em 14/11/2026**; testes em `db/tests/0023_clinical_documents.test.sql` e `db/tests/extension-documents.test.mjs`):

- `clinical_documents`: `kind` (`exam_request`, `supplement_prescription`, `attendance_declaration`, `general_guidance`), título (2–120), texto (≤ 6.000), `exams` (lista JSON de até 60 nomes; só no pedido de exames), `document_date`, `status` (`draft`/`published`) e `published_at`. Só owner/nutricionista cria, só para paciente ativo do consultório; paciente, tipo e autor não mudam. Pedido de exames precisa de exame ou texto; os outros tipos precisam de texto. Apagar o paciente leva os documentos.
- `clinical_document_templates`: modelos do consultório (mesmos campos, sem paciente nem data), até 100 por consultório (limite no endpoint).
- Nenhum papel do Directus tem permissão de coleção: tudo passa pelos endpoints abaixo. O PDF é gerado na hora pelo app (não há `pdf_path` nem arquivo guardado).

| Endpoint | Quem |
|---|---|
| `GET`/`POST /rafanutri/patients/:id/documents`, `GET`/`PUT`/`DELETE /rafanutri/documents/:id` | profissional do consultório |
| `GET`/`POST /rafanutri/document-templates`, `DELETE /rafanutri/document-templates/:id` | profissional do consultório |
| `GET /rafanutri/me/patient/documents[?c=]`, `GET /rafanutri/me/patient/documents/:id` (só publicados do registro ligado à conta) | paciente |

## Métricas do plano gratuito (RN-214)

Migração `0022_product_events.sql` (idempotente; testes em `db/tests/0022_product_events.test.sql`):

- `product_events` (`event`, `organization_id`, `user_id`, `patient_id`, `data`, `created_at`), sem nome, e-mail nem dado clínico. Gatilhos gravam `patient_created`, `invite_sent`, `patient_activated`, `paid_interest` e `recommendation_read`; o hook `rafanutri-hooks` grava `limit_reached` antes de recusar o 21º paciente (um gatilho seria desfeito com o insert que falha). Na primeira aplicação, preenche o histórico a partir das tabelas existentes.
- Views `metrics_free_orgs`, `metrics_active_patients_distribution`, `metrics_limit_hits_monthly`, `metrics_activation`, `metrics_waitlist`. Nenhum papel do Directus tem permissão nelas (a API devolve 403).
- Painel: `SSH_KEY=~/vpsOracleBruno/ssh/ssh-key-2026-07-18.key db/scripts/metrics.sh`.

## Paciente com mais de um nutricionista (RN-211)

Sem migração (o vínculo por consultório vem da 0018). `GET /rafanutri/me/patient` traz um registro por consultório, com `practice.has_logo`; os endpoints `/rafanutri/me/patient/*` aceitam `?c=<registro>` e só devolvem dados desse registro. `GET /rafanutri/practices/:id/logo` entrega o logo a membros do consultório e a pacientes com vínculo ativo nele.

## O que o paciente vê (RN-210)

Migração `0021_patient_share_settings.sql` (idempotente; testes em `db/tests/0021_patient_share_settings.test.sql`):

- `organizations.patient_share_defaults` (padrão do consultório) e `patients.share_settings` (nulo = segue o padrão), só com as chaves booleanas `show_kcal`, `show_macros`, `show_weight_history`;
- `patient_share(paciente)` devolve o que vale; `patient_weight_history(paciente)` devolve data e peso, e nenhuma linha quando o histórico não está liberado.

| Endpoint | Quem |
|---|---|
| `GET`/`PUT /rafanutri/patients/:id/share` (`as_default: true` grava o padrão; só owner), `GET /rafanutri/patients/:id/preview` | profissional |
| `GET /rafanutri/me/patient/weight[?c=]` | paciente |

`GET /rafanutri/me/patient/plan` passa a trazer `share` e, só quando liberado, `per100g` dos alimentos (energia e/ou macros).

## Documentos do paciente (RN-209)

Sem migração. `GET /rafanutri/me/patient/plans[?c=]` lista os planos já publicados do registro (vigente e anteriores); `GET /rafanutri/me/patient/plan?p=<plano>` devolve um deles (só `published`/`archived` com `published_at`), com o cabeçalho do PDF em `document`. O app gera o PDF na hora em `/p/documentos/:id/pdf`.

## Receitas: biblioteca e envio ao paciente (RN-206, RN-207)

Migração `0019_recipe_library.sql` (idempotente; testes em `db/tests/0019_recipe_library.test.sql`):

- `recipes` ganha `description` (≤ 600), `prep_minutes` (1–1440), `difficulty` (`easy`/`medium`/`hard`), `tags` (lista JSON, até 10) e `image` (`directus_files`, `on delete set null`);
- `patient_recipes`: receita enviada a um paciente (observação ≤ 500). Só owner/nutricionista envia, só para paciente ativo do consultório e só receita do próprio consultório; um envio por receita e paciente (reenviar atualiza a observação).

| Endpoint | Quem |
|---|---|
| `GET /rafanutri/recipes`; `POST`/`DELETE /rafanutri/recipes/:id/image` (data URL JPG/PNG/WebP até 600 KB, assinatura conferida) | profissional |
| `GET /rafanutri/recipes/:id/image` | profissional do consultório ou paciente que vê a receita |
| `GET`/`POST /rafanutri/patients/:id/recipes`, `DELETE …/recipes/:recipeId` | profissional |
| `GET /rafanutri/me/patient/recipes[?c=]`, `GET /rafanutri/me/patient/recipes/:id[?c=]` | paciente: enviadas + usadas no plano publicado |

## Área do paciente: convite e conta (RN-203, RN-204)

Migração `0018_patient_app_access.sql` (**aplicada na vpsrafa em 14/11/2026**), testes em `db/tests/0018_patient_app_access.test.sql`, no teste de isolamento e no e2e `apps/web/e2e/area-paciente.spec.ts`.

| Regra | Onde |
|---|---|
| `patients.app_user_id` liga o registro do paciente (num consultório) à conta de login; a mesma conta pode estar em vários consultórios (RN-211), uma vez por consultório | coluna + índice único `(organization_id, app_user_id)` |
| O vínculo só muda pelos endpoints (variável de sessão `rafanutri.patient_link` na transação). Pela API de itens, o Directus recusa o campo e o gatilho recusa de novo | gatilhos `patients_app_link_guard` e `patients_app_link_insert_guard` |
| Convite: token de 32 bytes guardado só como hash, uso único, até 7 dias, um pendente por paciente, só para paciente ativo, criado por owner/nutricionista | `patient_app_invites` + gatilho |
| Papel **Paciente** no Directus (política que só lê o próprio usuário); nada de coleções. Conta de paciente não cria consultório; e-mail de profissional não vira conta de paciente | migração + extensão |
| Arquivar o paciente tira o acesso (a área só mostra registros ativos); revogar desfaz o vínculo e cancela o convite pendente | extensão |
| `GET /rafanutri/patients/:id/app-access`, `POST …/app-invite`, `POST …/app-access/revoke`; públicos `POST /rafanutri/public/patient-invites/open` e `/accept` (token no corpo); `POST /rafanutri/patient-invites/accept` (conta já existente, logada); `GET /rafanutri/me/patient`; `GET /rafanutri/me/patient/plan?c=<paciente>` (RN-205: plano publicado com nomes, medidas caseiras, substituições e preparações resolvidos no servidor, só alimentos públicos ou do consultório do registro) | extensão `rafanutri` |

Sem SMTP ainda: o convite é um link copiável (WhatsApp) e o paciente cria a senha no primeiro acesso. Convite por e-mail e entrada por link mágico entram com o Resend.

Limpeza das contas de paciente criadas pelo e2e (usuário de teste):

```sql
delete from directus_users where email like 'e2e.paciente.%@example.com' and role = '5d1c7a3e-0002-4b6e-9a01-7e2a0c9a0002';
```

## Fichas técnicas de demonstração da UAN

`apps/web/scripts/seed-uan-fichas.ts` cadastra, pela API e com o login do responsável pela empresa, um fornecedor fictício, ~70 insumos com preço de atacado aproximado e vínculo à TACO, e **73 fichas técnicas aprovadas** (desjejum, almoço, lanche e jantar: arroz e feijão, 18 pratos principais, guarnições, saladas, sopas, sobremesas, frutas e bebidas), com 50 porções, passos e pontos críticos de temperatura. O "Molho de tomate caseiro" é sub-receita de três pratos. A aprovação usa o mesmo cálculo do app (`lib/uan/techsheets` + `nutrition-core`). Idempotente: o que já existe com o mesmo nome não é recriado.

```bash
SEED_EMAIL=<responsável> SEED_PASSWORD=<senha> pnpm db:seed:uan
```

Os valores são de demonstração; revisar com a RT antes de usar numa unidade real. O leite integral da TACO não tem energia analisada, então as preparações com leite mostram o aviso de valor não analisado.

Migração `0058_notifications.sql` (**aplicada na vpsrafa em 21/11/2026**, backup `antes-0058-2026-11-21.dump`; testes em `db/tests/0058_notifications.test.sql` e regras em `db/tests/extension-notifications.test.mjs`): avisos ao paciente por Telegram e e-mail. `notification_settings` (por consultório: lembretes ligados, até 3 horários entre 1, 2, 3, 6, 12, 24, 48 e 72 h, aviso de consulta marcada, aviso de plano novo, recado do lembrete); `patient_contact_prefs` (por paciente: e-mail e Telegram ligados ou não, chat do Telegram, hash do link de ativação com validade; o chat só muda com `rafanutri.telegram_link = on`, isto é, pelo bot ou pelo desligar); `notification_outbox` (fila: tipo, canal, destinatário, texto, situação queued/sent/failed/skipped, tentativas, erro, `dedupe_key` única). O motor roda na extensão (`directus/extensions/rafanutri/notify.js`) a cada minuto: gera os avisos de consulta marcada/remarcada/cancelada e plano novo (mudanças dos últimos 30 min), os lembretes por janela, envia (Telegram primeiro; e-mail só no importante, com o modelo `templates/notification.liquid`) e apaga o histórico com mais de 180 dias. Variáveis no `.env` do Directus: `TELEGRAM_BOT_TOKEN` (o webhook `/rafanutri/public/telegram/webhook` é registrado sozinho ao subir, com segredo derivado do token), `RAFANUTRI_SITE_URL`, `PUBLIC_URL` e `SECRET` (assina o link de cancelar e-mails).

Backup diário (21/11/2026): `~/backups/rafanutri/backup-diario.sh` na vpsrafa (cron `0 3 * * *` UTC), `pg_dump -Fc` conferido com `pg_restore --list`, 14 dias em `~/backups/rafanutri/diario/`. Restaurar: `docker exec -i rafanutri-postgres sh -c 'pg_restore --clean --if-exists -U $POSTGRES_USER -d $POSTGRES_DB' < arquivo.dump`.

Migração `0059_subscriptions.sql` (**aplicada na vpsrafa em 21/11/2026**, backup `antes-0059-2026-11-21.dump`; testes em `db/tests/0059_subscriptions.test.sql` e regras em `db/tests/extension-billing.test.mjs`): assinatura da plataforma por Pix. `plans` ganha `sellable` e as linhas `essential`, `professional` e `clinic` (preço zero, fora de venda até o admin definir). `platform_billing` (linha única: chave Pix, nome e cidade do recebedor sem acento, e-mail de aviso, carência em dias). `subscriptions` (uma por consultório: plano, próximo plano, situação pending/active/canceled/ended, fim do período pago, cancelar no fim). `subscription_invoices` (valor, período mensal, vencimento, situação open/paid/void, `txid` e código Pix gravados na emissão, "já paguei", quem confirmou; auditada). Escrita só com `rafanutri.billing = on` (gatilho `billing_guard`); fatura paga não muda. `user_contact_prefs` guarda o Telegram de pessoas (owner, admin) e `notification_outbox` ganha `user_id` e os tipos da cobrança. Endpoints em `directus/extensions/rafanutri/subscriptions.js` (código Pix em `billing.js`); o ciclo roda junto com o dos avisos. Consultório com plano pago sem linha em `subscriptions` (cortesia por SQL) não é mexido pelo ciclo.

Migração `0060_plan_limits.sql` (**aplicada na vpsrafa em 21/11/2026**, backup `antes-0060-2026-11-21.dump`): o Essencial passa a ir até **100 pacientes ativos** (o Profissional e o Clínica seguem sem limite). O gatilho `enforce_active_patient_limit` só barra novos ativos; a assinatura (`/billing/subscribe`) recusa um plano menor que o uso atual.
