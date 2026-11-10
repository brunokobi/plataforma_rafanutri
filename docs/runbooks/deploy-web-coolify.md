# Roteiro — deploy do app web no Coolify (vpsrafa)

App: `apps/web` (Next.js 16, saída `standalone`). Domínio: **https://rafanutri.brunokobi.tech**. Backend: Directus em `https://rafanutri-api.brunokobi.tech` ([ADR 0008](../adr/0008-backend-directus.md)).

O deploy é automático: **cada push na `main`** que mexa no app dispara um novo build no Coolify. O CI do GitHub (lint, typecheck, testes, build e e2e) roda em paralelo e garante que a `main` continua verde.

## 1. Configuração inicial (uma vez, pela interface do Coolify)

Abra o painel do Coolify da vpsrafa (endereço no repositório privado de infraestrutura; não publique o IP aqui, porque este repositório é público e o Cloudflare esconde o IP de origem).

O repositório `brunokobi/plataforma_rafanutri` é **público**, então o Coolify clona direto pela URL, sem GitHub App.

### 1.1 Criar projeto e aplicação
1. **Projects → + Add** → nome `Rafanutri` (o ambiente `production` é criado junto).
2. Dentro de `production`: **+ New → Public Repository** → URL `https://github.com/brunokobi/plataforma_rafanutri` → **Check repository** → branch `main`.
3. **Build Pack: Dockerfile**, com os campos:

| Campo | Valor |
|---|---|
| Base Directory | `/` |
| Dockerfile Location | `/apps/web/Dockerfile` |
| Ports Exposes | `3000` |
| Domains | `https://rafanutri.brunokobi.tech` |

4. **Environment Variables**:

| Variável | Valor | Build? |
|---|---|---|
| `DIRECTUS_URL` | `https://rafanutri-api.brunokobi.tech` | não |
| `NEXT_PUBLIC_SITE_URL` | `https://rafanutri.brunokobi.tech` | **sim** (marcar "Build Variable") |

5. **Advanced**:
   - **Auto Deploy**: ligado.
   - **Watch Paths** (só rebuilda quando o app muda):
     ```
     apps/web/**
     packages/**
     package.json
     pnpm-lock.yaml
     pnpm-workspace.yaml
     turbo.json
     ```
   - **Health Check**: ligado, path `/api/health`, porta `3000`.
6. **Deploy**. O primeiro build leva alguns minutos na VPS (2 OCPU ARM).

### 1.2 Deploy automático (webhook do GitHub)
Com repositório público, o GitHub não avisa o Coolify sozinho. Configure o webhook uma vez:
1. No Coolify, na aplicação → **Webhooks** → seção **GitHub**: defina um **Webhook Secret** (gere com `openssl rand -hex 32`) e copie a **URL do webhook** mostrada.
2. No GitHub: **Settings → Webhooks → Add webhook**:
   - Payload URL: a URL copiada do Coolify;
   - Content type: `application/json`;
   - Secret: o mesmo segredo do passo anterior;
   - Eventos: **Just the push event**.
3. Faça um push de teste e confira em **Recent Deliveries** (GitHub) que a entrega retornou `200`, e no Coolify que um deploy novo começou.

### 1.3 Directus
No `.env` do Directus da Rafanutri (`~/apps/rafanutri-directus/.env`), inclua o domínio do app em `CORS_ORIGIN`:

```dotenv
CORS_ORIGIN=http://localhost:3000,https://rafanutri.brunokobi.tech
```

Depois rode `docker compose up -d --force-recreate directus` (só `restart` não recarrega o `.env`). O login é feito pelo servidor do Next.js, então isso não é obrigatório hoje, mas já deixa o caminho pronto para chamadas do navegador.

## 2. Conferir depois do deploy

```bash
curl -s https://rafanutri.brunokobi.tech/api/health      # {"status":"ok"}
curl -sI https://rafanutri.brunokobi.tech/app | grep -i location   # /login?next=%2Fapp
```

- Abrir `/` e `/login` no navegador, nos temas claro e escuro.
- Entrar com um usuário do Directus: cai em `/app` ("Bem-vindo, …") e o botão **Sair** volta ao login.

## 3. Rollback

No Coolify, abra a aplicação → **Deployments** → escolha um deploy anterior que funcionava → **Redeploy**. Em seguida, corrija o problema na `main`; o próximo push gera um deploy novo.

## 4. Problemas conhecidos

| Sintoma | Causa provável | Solução |
|---|---|---|
| `no available server` | A aplicação não existe ou está parada no Coolify | Conferir o status da aplicação e os logs do deploy |
| 502 Bad Gateway | O Next.js não escuta em `0.0.0.0` | O Dockerfile já define `HOSTNAME=0.0.0.0`; conferir se não foi sobrescrito por variável no Coolify |
| Build morre sem mensagem clara | Falta de memória na VPS | O build usa `NODE_OPTIONS=--max-old-space-size=2048`; conferir `free -h` e serviços pesados no momento do build |
| Login sempre falha com "Não foi possível entrar agora" | `DIRECTUS_URL` errada ou Directus fora do ar | `curl https://rafanutri-api.brunokobi.tech/server/ping` deve responder `pong` |
| "Muitas tentativas seguidas" | Rate limiter do Directus | Aguardar um minuto |

## 5. Rodar a mesma imagem localmente

```bash
docker build -f apps/web/Dockerfile -t rafanutri-web .
docker run --rm -p 3100:3000 -e DIRECTUS_URL=https://rafanutri-api.brunokobi.tech rafanutri-web
# http://localhost:3100
```
