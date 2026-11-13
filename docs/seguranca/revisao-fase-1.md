# Revisão de segurança da Fase 1 (RN-049)

- **Data:** 12 e 13/11/2026
- **Escopo:** tudo o que a Fase 1 criou na vpsrafa — app web (`rafanutri.brunokobi.tech`), Directus (`rafanutri-api.brunokobi.tech`), banco (migrações 0001 a 0014), extensões `rafanutri` e `rafanutri-hooks`.
- **Resultado:** **nenhuma pendência crítica aberta no código.** Uma pendência crítica de **operação** continua aberta: o backup diário automático (ver o fim).

## 1. Isolamento entre consultórios (equivalente às políticas RLS)

O isolamento é feito por permissões do Directus filtradas pelo consultório, gatilhos no banco e ganchos/endpoints da extensão ([ADR 0008](../adr/0008-backend-directus.md)).

| Verificação | Como | Resultado |
|---|---|---|
| Política pública (sem login) | levantamento de `directus_permissions` | nenhuma permissão sobre dados; só endpoints públicos da anamnese (por token) e o cadastro |
| Papel Profissional | 36 regras revisadas uma a uma | leitura e edição filtradas por `$CURRENT_USER` como owner/nutricionista do consultório |
| Criação sem filtro de permissão | gatilhos | **corrigido (0012):** os gatilhos pulavam a checagem de consultório quando o autor vinha vazio; o autor passou a ser obrigatório |
| `validation` do Directus como proteção | testes | **corrigido (0011/0012):** a validação não vale para campo ausente; regras movidas para o banco/gancho |
| Modelos "da plataforma" | teste de isolamento | **corrigido (0011):** usuário criava modelo sem consultório, visível a todos |
| Teste automatizado | `db/tests/api-isolation.test.mjs` | **53 verificações passando** (antes de RN-041/042; a versão atual inclui também alimentos, preparações e orientações) |
| Testes do banco | `db/tests/*.test.sql` | todos passando num banco novo com as 13 migrações e no banco real |

## 2. Rotas de servidor e acesso privilegiado

- O app web **nunca** usa o token de administrador: todas as leituras e gravações vão ao Directus com o token do próprio usuário (cookie `httpOnly`), então as permissões valem sempre.
- Os endpoints da extensão que gravam direto no banco (`/rafanutri/organizations`, `/foods`, `/recipes`, `/snippets`) resolvem o consultório a partir do usuário logado (owner/nutricionista) e só alteram registros desse consultório; os gatilhos conferem de novo.
- Os endpoints públicos da anamnese só aceitam token de 32 bytes, guardam só o hash e respondem o mínimo (questionário, rascunho, primeiro nome, marca do consultório).
- O token de administrador só aparece em scripts de manutenção (`db/directus/*.mjs`, teste de isolamento), passado por variável de ambiente.

## 3. Teste manual de IDOR (troca de ids nas URLs)

Com um segundo consultório temporário (criado pelo cadastro público e apagado ao final), logado como o usuário de teste do primeiro:

| Tentativa | Resultado |
|---|---|
| Abrir ficha, avaliações, planos, um plano específico e anamneses do paciente alheio | 404 em todas, sem nenhum dado do outro consultório no HTML |
| Abrir questionário e preparação do outro consultório | 404 |
| Agenda com `?paciente=` alheio | abre a própria agenda, sem pré-selecionar nem mostrar o paciente alheio |
| API: ler paciente, plano, questionário, modelo de plano e alimento alheios | 403 |
| API: alterar paciente alheio | 403 |
| Endpoints: alterar/arquivar alimento e alterar preparação alheios | 404 |

## 4. Cabeçalhos de segurança

Servidos pelo app em produção (`apps/web/next.config.ts`):

- `Content-Security-Policy` (novo): `default-src 'self'`, sem recursos de terceiros além do Cloudflare Web Analytics; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Exceções documentadas: `'unsafe-inline'` em scripts (inicialização do App Router, sem nonce por enquanto) e `'wasm-unsafe-eval'` + `connect-src data:` (gerador de PDF). Testado: páginas públicas, login, editor de plano com geração de PDF e anamnese pública — **sem violações**.
- `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (câmera, microfone e localização desligados).

## 5. Logs

- Procurados CPF e nomes de pacientes de teste nos logs do Directus e do app: **nenhuma ocorrência**. O app registra só status e código de erro do Directus.
- **Corrigido:** o Directus registra a URL de cada requisição, e o token do link público da anamnese ia na URL. Os endpoints públicos passaram a receber o token no corpo (`POST /rafanutri/public/anamneses/open` e `/save`), e os logs antigos foram descartados ao recriar o contêiner. Verificado: o fluxo do paciente não grava mais o token.
- Sentry ainda não está configurado (RN-017).

## 6. Pendências

| Pendência | Gravidade | Situação |
|---|---|---|
| **Backup diário do banco fora da VPS + teste de restauração** | **Crítica (operação)** | Só existem cópias manuais (`pg_dump` antes de cada migração, em `~/backups/rafanutri/` na própria VPS). A configuração automática foi bloqueada pelo controle de permissões do Claude Code e precisa ser liberada pelo dev; a cópia para fora da VPS precisa de um bucket (R2 ou Object Storage) |
| Senha fraca do usuário de teste (`brunokobi2@hotmail.com`) | Média | Usuário só de teste; trocar antes de qualquer dado real |
| Verificação de e-mail no cadastro e recuperação de senha | Média | Dependem dos registros DNS do Resend no Cloudflare |
| CSP com `'unsafe-inline'` em scripts | Baixa | Evoluir para nonce quando houver tempo |
| Painel do Coolify com porta 8010 aberta além do HTTPS | Baixa | Fechar a porta no firewall e usar só `coolify.brunokobi.tech` |
| 2FA para o administrador do Directus | Baixa | Recomendado antes de dados reais |
