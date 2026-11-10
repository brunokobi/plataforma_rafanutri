# Roteiro — instalar o Directus da Rafanutri na vpsrafa

Instalação feita pelo dev, seguindo o [ADR 0008](../adr/0008-backend-directus.md). Instância **nova e só da Rafanutri**, Directus **12.6.1** (mais nova em 09/11/2026), Postgres próprio, atrás do Traefik do Coolify.

> Nenhum segredo vai para este repositório. As senhas ficam só no `.env` da VPS (`chmod 600`).

## Status da instalação (análise de 10/11/2026)

| Item | Situação |
|---|---|
| Containers | `rafanutri-directus` (12.6.1) e `rafanutri-postgres` (pg16 + pgvector disponível), `restart: unless-stopped`, sem portas publicadas no host |
| Rede | Directus nas redes `coolify` e interna; Postgres só na interna |
| URL e TLS | `https://rafanutri-api.brunokobi.tech` respondendo atrás do Cloudflare, certificado válido |
| Banco | Só as 33 tabelas de sistema do Directus; nenhuma tabela da Rafanutri ainda (esperado na etapa de planejamento) |
| Usuários | 1 (administrador); só o papel Administrator |
| Extensões | Pasta `extensions/` montada e vazia |
| Consumo | ~205 MB (Directus) + ~31 MB (Postgres); a VPS tem ~6,8 GB disponíveis |
| `.env` | Permissão 600 |
| Pendências | `ADMIN_PASSWORD` já removido do `.env` (10/11/2026); **backup diário ainda não configurado**; incluir no UptimeRobot; confirmar o rate limiter ligado |

**Particularidade da linha 12:** `GET /server/health` responde `403` para requisição anônima. Para monitor externo, use `GET /server/ping` (responde `pong`). Já `GET /server/info` responde `200` sem login.

## 1. Antes de começar

- [ ] Medir a folga da VPS: `free -h` e `docker stats --no-stream`. A Rafanutri precisa de cerca de **0,7 a 1 GB de RAM** (Directus de 300 a 500 MB, Postgres de 200 a 400 MB).
- [ ] Escolher o subdomínio, por exemplo `rafanutri-api.brunokobi.tech`. O registro curinga do Cloudflare já aponta para a vpsrafa.
- [ ] Conferir a versão mais nova antes de instalar (`npm view directus version` ou as tags no Docker Hub) e fixar a tag exata no compose. Nunca usar `latest`.

## 2. Arquivos na VPS

Diretório sugerido: `~/apps/rafanutri-directus/`.

`docker-compose.yml`:

```yaml
name: rafanutri-directus

services:
  db:
    image: pgvector/pgvector:pg16        # multi-arch (ARM64); pgvector para o RAG futuro
    restart: unless-stopped
    environment:
      POSTGRES_DB: rafanutri
      POSTGRES_USER: rafanutri
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data
    networks: [internal]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rafanutri -d rafanutri"]
      interval: 10s
      retries: 10

  directus:
    image: directus/directus:12.6.1
    restart: unless-stopped
    depends_on:
      db: { condition: service_healthy }
    volumes:
      - uploads:/directus/uploads
      - ./extensions:/directus/extensions
    env_file: .env
    environment:
      DB_CLIENT: pg
      DB_HOST: db
      DB_PORT: 5432
      DB_DATABASE: rafanutri
      DB_USER: rafanutri
      TELEMETRY: "false"
    networks: [internal, coolify]
    labels:
      - traefik.enable=true
      - traefik.docker.network=coolify
      - traefik.http.routers.rafanutri-directus.rule=Host(`rafanutri-api.brunokobi.tech`)
      - traefik.http.routers.rafanutri-directus.entrypoints=https
      - traefik.http.routers.rafanutri-directus.tls.certresolver=letsencrypt
      - traefik.http.services.rafanutri-directus.loadbalancer.server.port=8055

volumes:
  db_data:
  uploads:

networks:
  internal: {}
  coolify:
    external: true
```

`.env` (`chmod 600`; gere cada segredo com `openssl rand -hex 32`):

```dotenv
DB_PASSWORD=
KEY=
SECRET=
PUBLIC_URL=https://rafanutri-api.brunokobi.tech
ADMIN_EMAIL=
ADMIN_PASSWORD=
CORS_ENABLED=true
CORS_ORIGIN=http://localhost:3000,https://rafanutri.brunokobi.tech
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
RATE_LIMITER_ENABLED=true
RATE_LIMITER_POINTS=50
RATE_LIMITER_DURATION=1
```

Observações:
- **Postgres sem porta publicada**: só o Directus o acessa, pela rede interna. Para manutenção, use `docker compose exec db psql -U rafanutri`.
- **Sem portas abertas no firewall**: o acesso passa pelo Traefik (80/443). Não é preciso mexer no iptables nem na Security List.
- Ao trocar uma variável do `.env`, rode `docker compose up -d --force-recreate directus`. Só `restart` não recarrega o `env_file`, como já aconteceu no BPMN Assistant.

## 3. Subir e conferir

- [ ] `docker compose up -d`
- [ ] `curl -s https://rafanutri-api.brunokobi.tech/server/ping` deve retornar `pong`. Na linha 12, o `/server/health` exige autenticação.
- [ ] Entrar no painel com o administrador e trocar a senha inicial.
- [x] Depois do primeiro boot, remover `ADMIN_PASSWORD` do `.env` (ele só é usado na criação inicial).

## 4. Proteções mínimas (ADR 0004)

- [ ] **Backup diário** fora da VPS: `pg_dump` do banco `rafanutri` e cópia do volume `uploads` para o bucket externo (Object Storage da Oracle ou Cloudflare R2), com retenção de 14 dias.
- [ ] **Teste de restauração** do backup num Postgres limpo, uma vez por mês.
- [ ] **Monitor externo**: incluir `https://rafanutri-api.brunokobi.tech/server/ping` no UptimeRobot. Isso também ajuda a evitar que a Oracle marque a instância como ociosa.
- [ ] Registrar o serviço no README do repositório de infraestrutura (URL, diretório e onde está o `.env`).

## 5. O que me passar para a Fase 0

Só a **URL pública** e a **versão instalada**. Credenciais não devem ser coladas no chat nem no repositório da Rafanutri. Quando a implementação começar, a configuração da instância vira código versionado:
- migrações SQL das tabelas;
- bootstrap de papéis, políticas e permissões;
- extensões de endpoints e ganchos.

Esses passos rodam com um token de administrador passado por variável de ambiente.

## 6. A conferir na Fase 0 (linha 12)

O planejamento foi pensado com o modelo de papéis, políticas e permissões da linha 11. Antes de escrever o bootstrap de permissões e as extensões, ler as notas de versão da 12 e registrar as diferenças relevantes no ADR 0008.
