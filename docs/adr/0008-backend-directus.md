# ADR 0008 — Backend com Directus

- **Status:** aceito (09/11/2026)
- **Substitui em parte:** ADR 0001 (Supabase como backend), ADR 0002 (RLS no Postgres) e ADR 0004 (Supabase self-hosted na VPS)

## Contexto

O dev decidiu usar o **Directus** da infraestrutura da VPS como backend da Rafanutri, no lugar do Supabase. O Directus é um backend completo sobre o Postgres: autenticação, papéis e permissões, API REST/GraphQL, arquivos, automações (Flows), extensões, registro de atividades e WebSockets.

## Decisão

| Necessidade | Antes (Supabase) | Agora (Directus) |
|---|---|---|
| Banco | Postgres do Supabase | Postgres do Directus (imagem `pgvector/pgvector:pg16`, para RAG futuro) |
| Tabelas | Migrações SQL com Supabase CLI | Migrações SQL versionadas no repositório; o Directus espelha as tabelas |
| Login do profissional e do paciente | Supabase Auth | Directus Auth (e-mail e senha; Google via OAuth do Directus; link mágico avaliar) |
| Isolamento entre nutricionistas | RLS com `auth.uid()` | **Permissões do Directus** com filtro pela organização do usuário (`$CURRENT_USER`) + **ganchos** que validam a organização na criação + **gatilhos no banco** para regras invioláveis (limite de 20 pacientes, último owner, limite de membros) |
| Auditoria | Tabela `audit_logs` | Registro de atividades e revisões nativos do Directus |
| Arquivos (logo, fotos, PDFs) | Supabase Storage | Arquivos do Directus |
| Lógica de servidor | Edge Functions | Extensões do Directus (endpoints e ganchos) e Flows; lógica de tela nas Server Actions do Next.js |
| Tempo real (chat, Fase 6) | Supabase Realtime | WebSockets do Directus |
| App web | Next.js + `@supabase/ssr` | Next.js chamando a API do Directus com o token do usuário (cookies `httpOnly`) |
| Automações (WhatsApp, lembretes) | n8n | n8n (sem mudança), acionado por Flows ou webhooks do Directus |

### Regras

1. O app web sempre fala com o Directus usando o **token do próprio usuário**, para que as permissões valham. O token de administrador fica só em scripts de manutenção.
2. Operações que precisam ser atômicas (criar organização com owner e plano, aceitar convite, cadastro) viram **endpoints de extensão** com transação.
3. As regras críticas de negócio ficam **também** em gatilhos no Postgres. Assim, nem um acesso direto ao banco nem um erro de permissão consegue contorná-las.
4. A configuração do Directus (papéis, políticas, permissões e relações) é **código versionado** (script idempotente ou snapshot de schema). Nada é configurado só pela interface.
5. A Rafanutri usa uma **instância própria** do Directus, com banco próprio, separada do Directus de outros projetos.

## Impacto no backlog da Fase 0

| Item | Como fica |
|---|---|
| RN-003 | Postgres + Directus em Docker (local) e instância própria na VPS, com backup diário externo do Postgres |
| RN-004 | Migrações SQL das tabelas de organizações, membros, convites e planos, ligadas a `directus_users` |
| RN-005 | Login, cadastro e recuperação de senha pelo Directus; sessão em cookies `httpOnly` no Next.js |
| RN-006 e RN-007 | Criação de organização e convites por endpoints de extensão, com transação |
| RN-008 | Papel e política "Profissional", permissões por coleção filtradas pela organização, ganchos de validação na gravação e **testes de isolamento pela API** (no lugar do pgTAP) |
| RN-009 | Reduzido: auditoria nativa do Directus (atividades e revisões); só falta a tela para o owner |
| RN-010 a RN-012 | Iguais; a busca sem acento vira endpoint de extensão que usa a função SQL `search_foods` |
| RN-014 | O CI sobe Postgres + Directus em contêiner para rodar migrações, bootstrap e testes de API |
| RN-018 | Variáveis do Directus no `.env.example`; token de administrador só em scripts |

## Decisões de instalação (09/11/2026)

| Ponto | Decisão |
|---|---|
| Onde | **vpsrafa**, instalada pelo dev, conforme o roteiro [docs/runbooks/directus-vpsrafa.md](../runbooks/directus-vpsrafa.md) |
| Instância | **Nova e só da Rafanutri**, com Postgres próprio |
| Versão | **Mais nova da linha 12** (12.6.1 em 09/11/2026), com a tag fixada no compose. Atualizações de versão só de forma deliberada, com backup antes |

## Pontos em aberto

| Ponto | Por que importa | Quem decide |
|---|---|---|
| URL pública do Directus (ex.: subdomínio em `brunokobi.tech`) | Configuração do app web e do CORS | Dev, na instalação |
| Mudanças da linha 12 em relação à 11 | O planejamento foi pensado com a API de papéis, políticas e permissões da linha 11. Na Fase 0, conferir as notas de versão da 12 e ajustar o bootstrap de permissões e as extensões | Fase 0 (RN-003, RN-008) |
| Licença | O Directus usa BSL 1.1: gratuito para organizações com receita anual abaixo de US$ 5 milhões. Reavaliar se a Rafanutri passar disso | Dev |
| Link mágico para o paciente (Fase 1B) | O Directus não tem login sem senha pronto; precisa de endpoint próprio ou de senha simples | Fase 1B |

## Consequências

- Uma peça a menos para operar: o Directus já roda no ecossistema do dev.
- O painel do Directus serve como **back-office** (suporte, conferência de dados e cadastro das bases TACO e TBCA) sem construir telas administrativas.
- As permissões do Directus filtram bem a leitura, mas não validam relações no momento da criação. Por isso os ganchos de extensão são obrigatórios em todas as coleções com `organization_id`, com testes automatizados de isolamento pela API.
- Os documentos de fase escritos antes desta decisão citam Supabase, RLS, `auth.uid()` e Edge Functions. Leia esses trechos pela tabela de equivalência acima.
