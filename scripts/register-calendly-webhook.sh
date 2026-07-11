#!/usr/bin/env bash
# Registra el webhook NATIVO de Calendly apuntando a la Edge Function, genera un
# signing_key y lo carga como secret en Supabase. El PAT se pasa por variable de
# entorno, nunca como argumento (no queda en el historial).
#
# Uso:
#   export PATH="$HOME/.local/bin:$PATH"
#   CALENDLY_PAT='pega-tu-token-aca' ./scripts/register-calendly-webhook.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"   # para encontrar el CLI de supabase

: "${CALENDLY_PAT:?Falta CALENDLY_PAT. Corré: CALENDLY_PAT='...' ./scripts/register-calendly-webhook.sh}"

FUNC_URL="https://cpanrhrgewcsqmrtmyeo.supabase.co/functions/v1/calendly-webhook"

echo "1) Obteniendo tu organización de Calendly..."
ORG=$(curl -sS -H "Authorization: Bearer $CALENDLY_PAT" https://api.calendly.com/users/me \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).resource.current_organization)}catch(e){console.error('No pude leer la organización. ¿El token es válido?');process.exit(1)}})")
echo "   organización: $ORG"

echo "2) Generando signing_key..."
SIGNING_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")

echo "3) Creando la webhook subscription (invitee.created + invitee.canceled, scope organización)..."
RESP=$(curl -sS -X POST https://api.calendly.com/webhook_subscriptions \
  -H "Authorization: Bearer $CALENDLY_PAT" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$FUNC_URL\",\"events\":[\"invitee.created\",\"invitee.canceled\"],\"organization\":\"$ORG\",\"scope\":\"organization\",\"signing_key\":\"$SIGNING_KEY\"}")

# Verificar que se creó (debe traer resource.uri). Si Calendly devolvió error, mostrarlo.
CREATED=$(printf '%s' "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);if(j.resource&&j.resource.uri){console.log(j.resource.uri)}else{console.error('ERROR de Calendly:\n'+JSON.stringify(j,null,2));process.exit(1)}}catch(e){console.error('Respuesta inesperada:\n'+d);process.exit(1)}})")
echo "   suscripción creada: $CREATED"

echo "4) Cargando el signing_key como secret en Supabase (CALENDLY_SIGNING_KEY)..."
printf 'CALENDLY_SIGNING_KEY=%s\n' "$SIGNING_KEY" > /tmp/calsig.env
supabase secrets set --env-file /tmp/calsig.env
rm -f /tmp/calsig.env

# Guardar también en el .env local (gitignored), sin pisar lo que ya hay.
if ! grep -q '^CALENDLY_SIGNING_KEY=' supabase/functions/.env 2>/dev/null; then
  printf 'CALENDLY_SIGNING_KEY=%s\n' "$SIGNING_KEY" >> supabase/functions/.env
fi

echo ""
echo "LISTO. Webhook nativo registrado y signing_key cargado."
echo "Avisale a Claude que ya corriste esto para que deploye la función."
