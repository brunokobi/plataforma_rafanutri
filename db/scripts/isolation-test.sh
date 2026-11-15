#!/usr/bin/env bash
# RN-008/RN-213 — Roda db/tests/api-isolation.test.mjs contra produção sem token de administrador.
# A lista de tabelas do produto vem do banco (information_schema) e a limpeza do que o teste criou
# (consultórios de teste, em cascata, e as contas @example.com) é feita por SQL pela chave SSH da vpsrafa.
# Uso: db/scripts/isolation-test.sh   (opcional: SSH_KEY, ISOLATION_HOST, DIRECTUS_URL)
set -u
cd "$(dirname "$0")/../.."
KEY="${SSH_KEY:-$HOME/vpsOracleBruno/ssh/ssh-key-2026-07-18.key}"
HOST="${ISOLATION_HOST:-ubuntu@130.61.140.66}"
URL="${DIRECTUS_URL:-https://rafanutri-api.brunokobi.tech}"
psql_prod() { ssh -o BatchMode=yes -i "$KEY" "$HOST" 'docker exec -i rafanutri-postgres sh -c "psql -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d \$POSTGRES_DB -tA"'; }

COLLECTIONS=$(echo "select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema = 'public' and table_name not like 'directus_%';" | psql_prod)
[ -n "$COLLECTIONS" ] || { echo "Não consegui listar as tabelas do banco." >&2; exit 2; }

OUT=$(mktemp)
# Comando de psql para o teste habilitar o módulo UAN nos consultórios de teste (só eles: o teste confere o nome).
PSQL_CMD="ssh -o BatchMode=yes -i '$KEY' '$HOST' 'docker exec -i rafanutri-postgres sh -c \"psql -q -v ON_ERROR_STOP=1 -U \\\$POSTGRES_USER -d \\\$POSTGRES_DB\"'"
DIRECTUS_URL="$URL" ISOLATION_COLLECTIONS="$COLLECTIONS" ISOLATION_PSQL="$PSQL_CMD" node db/tests/api-isolation.test.mjs 2>&1 | tee "$OUT"
STATUS=${PIPESTATUS[0]}

CLEAN=$(grep -o 'CLEANUP_JSON .*' "$OUT" | tail -1 | sed 's/^CLEANUP_JSON //')
rm -f "$OUT"
if [ -n "$CLEAN" ]; then
  ORGS=$(node -e 'const c=JSON.parse(process.argv[1]);console.log(c.orgs.filter(x=>/^[0-9a-f-]{36}$/i.test(x)).map(x=>`'"'"'${x}'"'"'`).join(","))' "$CLEAN")
  USERS=$(node -e 'const c=JSON.parse(process.argv[1]);console.log(c.users.filter(x=>/^[0-9a-f-]{36}$/i.test(x)).map(x=>`'"'"'${x}'"'"'`).join(","))' "$CLEAN")
  # Só apaga contas de teste (@example.com) e consultórios em que todos os membros são contas de teste.
  SQL="begin;"
  [ -n "$ORGS" ] && SQL="$SQL delete from organizations o where o.id in ($ORGS) and not exists (select 1 from organization_members m join directus_users u on u.id = m.user_id where m.organization_id = o.id and u.email not like '%@example.com');"
  [ -n "$USERS" ] && SQL="$SQL delete from directus_users where id in ($USERS) and email like '%@example.com';"
  SQL="$SQL commit;"
  if echo "$SQL" | psql_prod >/dev/null; then
    echo "Limpeza: consultórios e contas de teste apagados."
  else
    echo "Limpeza por SQL falhou; suspendendo as contas de teste." >&2
    [ -n "$USERS" ] && echo "update directus_users set status = 'suspended' where id in ($USERS) and email like '%@example.com';" | psql_prod >/dev/null
  fi
fi
exit "$STATUS"
