# Dashboard-Raccel — Tracking de leads (fase 1: DB + ingestión)

Sistema de atribución y seguimiento de leads para el negocio de coaching high-ticket
(proyecto Linda Meneghelli). Responde: **¿de qué reel viene cada venta y qué setter/closer
la trabajó?** — atribución de punta a punta.

Esta fase entrega **solo el backend**: schema de Supabase (Postgres) + los 4 endpoints
de ingestión (Edge Functions). El dashboard y el proxy de Claude son fases posteriores.

## Modelo de datos

4 tablas en el schema `public`:

| Tabla      | Fuente                    | Llave de upsert          |
|------------|---------------------------|--------------------------|
| `leads`    | ManyChat (webhook)        | `manychat_contact_id`    |
| `bookings` | Calendly (vía Zapier)     | `calendly_event_id`      |
| `calls`    | Fathom (vía Zapier)       | (insert)                 |
| `sales`    | Hotmart (webhook) + manual| `hotmart_transaction_id` |

### Cascada de matcheo

Resuelta en la ingestión, a nivel DB (triggers `BEFORE` en las migraciones):

1. **lead ↔ booking** — por `ig_username` normalizado (sin `@`, minúsculas, trim).
2. **lead ↔ sale** — por email: `sales.email_comprador == bookings.email`; la sale hereda
   el `lead_id` del booking y setea `matcheada = true`. Es el match más frágil; cuando no
   hay booking con ese email, `matcheada = false` y queda para conciliación manual.
3. **booking ↔ call** — se resuelve en la Edge Function de Fathom (por `calendly_event_id`
   o email del asistente), que setea `calls.booking_id`.

Los no-matcheos se loguean (`RAISE NOTICE` en DB, `console.log` en las functions), no se
descartan. Un booking sin lead queda con `lead_id = null`; una sale sin match con
`matcheada = false`.

> Robustez extra: si un booking llega **antes** que el webhook del lead, cuando el lead
> entra se adoptan los bookings huérfanos con ese mismo handle (trigger `leads_backfill_bookings`).

## Estructura

```
supabase/
  config.toml                       # verify_jwt=false para los 4 webhooks
  migrations/
    20260706000001_initial_schema.sql   # tablas, checks, índices, RLS, updated_at
    20260706000002_matching_triggers.sql # normalización + cascada de matcheo
  functions/
    _shared/{auth,client,http,normalize}.ts
    manychat-webhook/index.ts
    calendly-webhook/index.ts
    fathom-webhook/index.ts
    hotmart-webhook/index.ts
    .env.example
  tests/
    flow_test.sql                   # criterio de éxito con asserts
scripts/
  test-flow.sh
```

## Puesta en marcha (local)

Requiere **Docker** corriendo (Docker Desktop / OrbColima) y el Supabase CLI.
El CLI ya está instalado en `~/.local/bin/supabase` (agregar al PATH si hace falta:
`export PATH="$HOME/.local/bin:$PATH"`).

```bash
# 1. Levantar el stack local (Postgres + Edge runtime + Studio)
supabase start

# 2. Aplicar migraciones y correr el test de flujo
./scripts/test-flow.sh          # hace db reset + corre tests/flow_test.sql

# 3. Servir las Edge Functions localmente
cp supabase/functions/.env.example supabase/functions/.env   # y editar WEBHOOK_SECRET
supabase functions serve --env-file supabase/functions/.env
```

> Sin Docker no se puede levantar el stack local. La estructura, migraciones y functions
> ya están completas; sólo hace falta Docker para correrlas. Alternativa: crear un proyecto
> en supabase.com y hacer `supabase link` + `supabase db push` (ver abajo).

### Deploy a un proyecto Supabase (nube)

```bash
supabase link --project-ref <TU_PROJECT_REF>
supabase db push                                    # aplica migraciones
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy manychat-webhook calendly-webhook fathom-webhook hotmart-webhook
```

Las funciones quedan en `https://<PROJECT_REF>.functions.supabase.co/<nombre>`.

## Configuración de cada conector

Todas exigen el secret compartido. Para ManyChat/Calendly/Fathom es el header
`x-webhook-secret: <WEBHOOK_SECRET>`. Hotmart usa su `hottok` (header `x-hotmart-hottok`
validado contra `HOTMART_HOTTOK`).

### 1. ManyChat → `manychat-webhook`
- **External Request** al final de la calificación, `POST` con header `x-webhook-secret`.
- Body JSON con: `manychat_contact_id` (obligatorio), `ig_username`, `nombre`,
  `fecha_primer_contacto`, `pieza_origen`, `respuesta_lead` (o `respuesta_primer_contacto`),
  `respuesta_lead_2`, `dolor`, `conciencia`, `crisis`, `econ_declarada`, `respuesta_econ`,
  `econ_calificacion`, `estado_funnel`, `feedback_descalificada`.
- Recalificación: se actualiza el lead **sin pisar** `conciencia` ni `pieza_origen`.

### 2. Calendly → `calendly-webhook` (vía Zapier)
- Trigger Zapier: *Invitee Created* / *Invitee Canceled* → acción Webhooks `POST` con header.
- Body: `calendly_event_id` (obligatorio), `ig_username` (viene del `?a1={{instagram_username}}`),
  `email`, `nombre`, `closer`, `fecha_llamada`, `estado` (o `canceled: true`).

### 3. Fathom → `fathom-webhook` (vía Zapier)
- Trigger Zapier: *New AI Summary* → acción Webhooks `POST` con header.
- Body: `resumen_fathom`, `transcript_url`, `fecha`, `resultado`, y para matchear el booking:
  `calendly_event_id` **o** `email` del asistente.

### 4. Hotmart → `hotmart-webhook`
- Webhook nativo de Hotmart (formato 2.0). Eventos: `PURCHASE_APPROVED`, `PURCHASE_REFUNDED`,
  `PURCHASE_CHARGEBACK`, `PURCHASE_CANCELED`, `PURCHASE_PROTEST`.
- Setear el `hottok` de Hotmart en `HOTMART_HOTTOK`.
- Transferencias manuales: insertar en `sales` con `metodo_pago = 'transferencia'` y
  `hotmart_transaction_id = null` (el matcheo por email corre igual vía trigger).

## Seguridad

- **RLS activado** en las 4 tablas desde el día uno. Sin policies todavía: sólo el
  `service_role` (que hace bypass de RLS) escribe, desde las Edge Functions. Las policies
  por rol (setter / closer / creador) llegan con el dashboard.
- Los webhooks validan un secret compartido y corren con `verify_jwt = false`.
- Nunca commitear `supabase/functions/.env` (está en `.gitignore`).

## Qué NO incluye esta fase

Dashboard, vistas por rol, proxy de la Claude API, tablas de users/teams, Google Sheets.
La fuente de verdad es Supabase.
