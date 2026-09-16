# Dashboard RACCEL — Contexto del proyecto

## Qué es
Dashboard de operaciones/ventas para el negocio de coaching de Linda Meneghelli (@coachlindameneghelli), operado por la agencia LuxeSphere. **En producción.**

Responde la pregunta central: **"¿de qué pieza de contenido viene cada venta y quién la trabajó?"**

## Stack y ubicaciones
- **Next.js + Supabase (PostgreSQL) + Vercel.** Edge Functions para webhooks. App en `web/`.
- **Prod:** `dashboard-raccel.vercel.app`
- **Repo:** `TexiTGOD/Dashboard-Raccel`
- **Supabase project ref:** `cpanrhrgewcsqmrtmyeo`
- **Proyecto local:** `~/Dev/Dashboard-Raccel` (se movió de ~/Desktop porque iCloud sincronizaba node_modules y rompía tsc/git — NO devolver el proyecto a Desktop/Documents)

## Flujo del negocio
Instagram → ManyChat (setea `pieza_origen`) → DM de calificación → Calendly (booking) → llamada de cierre.
- **Match booking↔lead** por `ig_username` normalizado.
- **Pagos:** manuales, los carga Linda.
- **Calificación de leads:** sistema de 3 dimensiones (dolor / urgencia / económica). Fuente de verdad = ManyChat: al poner una etiqueta, dispara un external request al webhook `calificacion-lead` que prende la columna. El dashboard es SOLO LECTURA sobre esto.

## Formatos de `pieza_origen`
Conviven dos formatos. **Ambos deben seguir funcionando.**
- **Viejo:** `REEL_DDMM`, `CARR_DDMM`, `HIST_DDMM`, `welcome`
- **Nuevo:** `Reel - dd/mm/aaaa`, `Posteo - dd/mm/aaaa`, `Historia - dd/mm/aaaa`

**Mapeo de display (distingue por FORMATO, no por palabra):**
- `REEL_` y `CARR_` (viejos) → "Posteo del DD/MM" (los REEL_ viejos eran carruseles mal etiquetados)
- `HIST_` → "Secuencia de Historias del DD/MM"
- `welcome` → "Seguimientos"
- `Reel - ...` (nuevo) → "Reel del DD/MM" (estos SÍ son reels reales)
- `Posteo - ...` → "Posteo del DD/MM"
- `Historia - ...` → "Secuencia de Historias del DD/MM"

El parsing vive en 3 lugares: `pieza_bucket()` (SQL, clasifica y canoniza el formato nuevo), `lib/pieza.ts` (TS, todo el display), y el filtro de `registros-tables.tsx`.

## Cómo trabaja Bruno (IMPORTANTE)
- **Todo paso a paso, explícito, con lo que tiene que copiar/pegar.** Se frustra con paredes de texto o respuestas vagas.
- **Una tanda a la vez, con stop points.** Si mete varias cosas en un mensaje, hay que separarlas y frenarlo.
- **Bruno pushea a mano.** CC NO pushea. PRs desde la web de GitHub. Bruno aplica migraciones por SQL Editor.
- **Parar para revisión de Bruno antes de aplicar/desplegar/pushear nada.**
- Pushback con razón, no validación vacía. Owning de errores sin sobreexplicar.
- Habla en rioplatense informal, a veces por voz con typos: parsear intención sobre texto literal.

## Restricciones estándar
- **Migraciones aditivas**, las aplica Bruno por SQL Editor. Auto-deploy de Supabase (merge→DB) está APAGADO.
- **Orden migración-vs-webhook:** si el webhook escribe una columna nueva → migración primero. Si corta una sangría → webhook primero.
- **Orden migración-vs-frontend:** si el front llama a un RPC nuevo → migración primero, merge después.
- **Solo anon key en el front, nunca service_role.**
- **RLS:** funciones DEFINER a propósito (sostienen las policies) — al tocarlas, revocar EXECUTE a `anon`, NO cambiarlas a INVOKER.
- Verificar tsc/lint/build antes de entregar.
- Frontend no se ve hasta merge + redeploy Vercel + hard refresh (Cmd+Shift+R).

## Webhooks (Edge Functions)
- `manychat-webhook` — ingesta de leads. Match por `manychat_contact_id` (unique).
- `calendly-webhook` — bookings. Match por `ig_username` normalizado.
- `calificacion-lead` — prende las 3 dimensiones de calificación.
- **Todos necesitan `verify_jwt = false` en `config.toml`** (validan con su propio `x-webhook-secret` contra la env `WEBHOOK_SECRET`). Sin ese bloque, Supabase rechaza con 401 UNAUTHORIZED_NO_AUTH_HEADER antes de que corra la función.
- Deploy: `supabase functions deploy <nombre>` (puede requerir `export PATH="$HOME/.local/bin:$PATH"`).

## Roles y vistas
- **admin** (contactluxesphere@gmail.com, lindameneghelli@hotmail.com) — ve todo. Linda es admin, NO closer: su profile tiene `closer_identifier = NULL`.
- **closer** — rol que hoy (pre Tanda 1) nadie usa en prod. `bookings.closer` guarda el email del host de Calendly (hoy siempre Linda, porque el Calendly es de ella), pero eso es independiente de qué `rol` tiene el usuario logueado. Se está dando de alta el primer profile con `rol = 'closer'` para Betina — ver atribución Linda→Betina.
- **setter** — `/setter`, tablero de métricas propio. Ve Leads, Agendas, % de agenda, Calificación y Meta. NO ve atendidas, ventas, % cierre ni resultado económico (el RPC `dashboard_setter_ventas` no se llama para rol setter). El guard de ruta permite solo admin y setter.
- La setter cobra **5% de comisión sobre el cash collected**.

## Entorno de testing local (montado)
- **Supabase local con Docker.** `supabase start` levanta la base en `127.0.0.1:54321` (Studio en `:54323`). Tiene todas las migraciones aplicadas y una copia de los datos de producción.
- **`web/.env.local`** apunta a la base LOCAL. El backup del que apunta a prod está en `web/.env.local.prod-backup`.
- **Dashboard local:** `cd web && npm run dev` → `http://localhost:3001`.
- **CC puede navegar y testear libremente en local — NO es producción.**
- Volver a prod: `cp web/.env.local.prod-backup web/.env.local`

## Definiciones de métricas (no crear variantes)
- `tasa_agenda` = leads distintos que agendaron / leads (no agendas/leads — así no pasa de 100%).
- `show_rate` = atendidas / llamadas ya pasadas.
- `close_rate_atendidas` = ventas atribuibles / atendidas.
- **Cash Collected** = suma de pagos recibidos en el rango (ancla `pm.fecha`).
- Las **metas son mensuales**: la comparación vs objetivo solo aplica si el período es un mes completo.

## Gotchas
- **"Pieza inválida" ≠ "Sin atribuir"** (inválida = valor que no matchea formato; sin atribuir = null).
- **Bookings huérfanos:** algunos no matchean lead. El prefill de Calendly usa `?a1={{ig_username}}` insertado con el selector de ManyChat (NO escrito a mano).
- Hay un bloque `[functions.hotmart-webhook]` huérfano en `config.toml` (la función no existe). Inofensivo.
- Plan Free de Supabase: sin backups automáticos, sin leaked password protection.
