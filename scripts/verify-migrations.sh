#!/usr/bin/env bash
# Aplica todas as migrações a um Postgres limpo, por ordem, e corre as
# asserções de `scripts/schema-checks.sql`. É o que impede que uma migração
# partida chegue ao projeto real: no CI corre contra o serviço `postgres`,
# localmente contra qualquer instância que se aponte em DATABASE_URL.
#
# Levantado do Coreto (scripts/verify-migrations.sh).
set -euo pipefail

PSQL_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ prelúdio (papéis e esquemas que o Supabase já traz)"
psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/supabase-prelude.sql"

for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$file")"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q -f "$file"
done

echo "→ asserções sobre o esquema e os seeds"
psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/schema-checks.sql"

echo "✓ migrações aplicadas e verificadas"
