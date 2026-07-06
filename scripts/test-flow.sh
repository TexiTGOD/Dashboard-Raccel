#!/usr/bin/env bash
# Corre el test del criterio de éxito contra la DB local de Supabase.
# Requiere Docker corriendo y `supabase start` levantado.
set -euo pipefail

cd "$(dirname "$0")/.."

# Aplica migraciones limpias en la DB local.
supabase db reset

# URL de conexión de la DB local.
DB_URL="$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"

echo "Corriendo flow_test.sql contra $DB_URL"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/flow_test.sql
