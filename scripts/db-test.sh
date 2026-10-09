#!/usr/bin/env bash
# Runs the database migrations and security tests on a throwaway local
# Postgres. Touches no real Supabase project. Needs Postgres 15+ binaries.
# Usage: scripts/db-test.sh   (PG_BIN=/usr/lib/postgresql/16/bin by default)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DIR="$(mktemp -d)"; PORT="${PG_PORT:-54331}"
RUN=""; [ "$(id -u)" = "0" ] && { chown postgres "$DIR"; RUN="su postgres -c"; }
run() { if [ -n "$RUN" ]; then $RUN "$*"; else bash -c "$*"; fi; }
cleanup() { run "$PG_BIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
run "$PG_BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
run "$PG_BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c listen_addresses=' -l $DIR/log -w start" >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase-stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$ROOT/supabase/tests/schema.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
