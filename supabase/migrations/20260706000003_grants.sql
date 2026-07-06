-- =============================================================================
-- Migración 0003 — GRANTs a los roles de Supabase
--
-- Con el flujo normal de `supabase db push` estos permisos se aplican solos.
-- Al crear el schema a mano (editor SQL como rol postgres) hay que darlos
-- explícitos, si no las Edge Functions con service_role reciben
-- "permission denied for table ...".
--
-- Nota de seguridad: aunque acá se otorga a anon/authenticated, RLS está activo
-- SIN policies, así que esos roles siguen sin poder leer/escribir. Sólo
-- service_role (que hace bypass de RLS) opera. Es el patrón por defecto de Supabase.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables    in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
grant all privileges on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all privileges on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all privileges on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all privileges on functions to anon, authenticated, service_role;
