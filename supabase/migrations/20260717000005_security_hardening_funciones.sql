-- =============================================================================
-- Migración 0019 — Hardening de seguridad de funciones (Security Advisor)
--
-- Resuelve dos grupos de warnings del Security Advisor de Supabase SIN tocar el
-- RLS/roles (admin/closer/setter + regla no negociable de leads en crisis).
-- Aditiva: solo ALTER FUNCTION (atributos) y REVOKE/GRANT. NO reproduce cuerpos
-- ni cambia lógica. NO modifica migraciones ya aplicadas.
--
-- Grupo 1 — "Function Search Path Mutable" (7 funciones INVOKER):
--   se les fija search_path = public vía ALTER (sin reproducir el cuerpo → sin
--   riesgo de drift). Hardening estándar.
--
-- Grupo 2 — SECURITY DEFINER llamables por anon (9 funciones):
--   SIGUEN SIENDO DEFINER (8 se usan dentro de policies RLS; handle_new_user es
--   el trigger de alta de usuarios — todas necesitan privilegios elevados).
--   Se revoca EXECUTE a `anon` y `public` (cierra la exposición como RPC público),
--   PERO se CONSERVA a `authenticated`.
--
--   Por qué authenticated conserva EXECUTE: la doc de Postgres (5.9 Row Security
--   Policies) — "Policy expressions are run ... with the privileges of the user
--   running the query". admin/closer/setter son todos `authenticated`; si perdiera
--   EXECUTE, cada query sobre esas tablas daría "permission denied for function" y
--   se caería TODO el RLS. Los warnings residuales de authenticated son
--   INTENCIONALES: son el costo de que el RLS funcione (decisión validada).
--
--   Revocar a anon es seguro: la app nunca consulta tablas RLS en contexto anon
--   (el middleware solo hace auth.getUser(); la query a profiles corre ya
--   autenticada) y el frontend no llama ninguna de estas 9 como RPC.
--
--   handle_new_user: es un trigger (no llamable por RPC). Los triggers disparan
--   por el mecanismo de trigger SIN chequear EXECUTE del rol que hace el INSERT,
--   así que se le revoca a todos (anon/authenticated/public) sin romper el alta
--   de usuarios — sigue disparando y corre como su owner (DEFINER).
--
-- Grupo 3 — "Leaked password protection": NO se toca (feature de plan Pro).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Grupo 1 — fijar search_path (funciones INVOKER, sin riesgo de elevación)
-- -----------------------------------------------------------------------------
alter function public.normalize_handle(text)      set search_path = public;
alter function public.normalize_email(text)       set search_path = public;
alter function public.set_updated_at()            set search_path = public;
alter function public.leads_normalize()           set search_path = public;
alter function public.leads_backfill_bookings()   set search_path = public;
alter function public.bookings_match()            set search_path = public;
alter function public.sales_match()               set search_path = public;

-- -----------------------------------------------------------------------------
-- Grupo 2 — SECURITY DEFINER usadas en policies: siguen DEFINER; fuera de
-- anon/public; authenticated conserva EXECUTE (requerido para evaluar las policies).
-- -----------------------------------------------------------------------------
revoke all on function public.is_admin()                    from public, anon;
grant execute on function public.is_admin()                 to authenticated, service_role;

revoke all on function public.current_rol()                 from public, anon;
grant execute on function public.current_rol()              to authenticated, service_role;

revoke all on function public.current_closer_identifier()   from public, anon;
grant execute on function public.current_closer_identifier() to authenticated, service_role;

revoke all on function public.closer_owns_lead(uuid)        from public, anon;
grant execute on function public.closer_owns_lead(uuid)     to authenticated, service_role;

revoke all on function public.closer_owns_booking(uuid)     from public, anon;
grant execute on function public.closer_owns_booking(uuid)  to authenticated, service_role;

revoke all on function public.closer_owns_sale(uuid)        from public, anon;
grant execute on function public.closer_owns_sale(uuid)     to authenticated, service_role;

-- ⚠️ Regla no negociable de crisis: estas dos ocultan leads en crisis a
-- closer/setter. Siguen DEFINER e intactas en lógica; solo dejan de ser públicas.
revoke all on function public.lead_is_crisis(uuid)          from public, anon;
grant execute on function public.lead_is_crisis(uuid)       to authenticated, service_role;

revoke all on function public.booking_lead_crisis(uuid)     from public, anon;
grant execute on function public.booking_lead_crisis(uuid)  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Grupo 2 (caso trigger) — handle_new_user: se revoca a todos. Dispara por el
-- trigger de alta, no por EXECUTE de un rol → el alta de usuarios no se rompe.
-- -----------------------------------------------------------------------------
revoke all on function public.handle_new_user() from public, anon, authenticated;
