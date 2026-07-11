-- =============================================================================
-- Migración 0004 — Auth, roles y RLS (Fase A del dashboard)
--
-- - Tabla `profiles`: mapea el usuario autenticado a su rol e identidad operativa.
-- - Trigger que crea el profile al registrarse (auth.users).
-- - Funciones helper SECURITY DEFINER para las policies (sin recursión de RLS).
-- - Policies RLS por rol en profiles + las 4 tablas de negocio.
--
-- REGLA NO NEGOCIABLE: los leads con crisis=true son INVISIBLES para closer y
-- setter a nivel base (horneado en las policies, no es un filtro de UI). Solo el
-- admin los ve. Es un protocolo de seguridad del negocio.
--
-- Las Edge Functions siguen escribiendo con service_role, que hace BYPASS de RLS:
-- agregar policies NO las afecta.
--
-- NOTA sobre recursión: las policies NO consultan otras tablas con subqueries
-- inline (eso dispara la RLS de la otra tabla -> recursión). Todo cruce entre
-- tablas se hace vía funciones SECURITY DEFINER (bypassean RLS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid        primary key references auth.users(id) on delete cascade,
  nombre            text,
  rol               text        not null default 'setter' check (rol in ('admin', 'closer', 'setter')),
  -- closer_identifier: debe igualar bookings.closer (hoy = email del host de
  -- Calendly, ej. lindameneghelli@hotmail.com) para poder filtrar "mis llamadas".
  closer_identifier text,
  activo            boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table  public.profiles is 'Usuario autenticado -> rol + identidad operativa. Base del control de acceso del dashboard.';
comment on column public.profiles.closer_identifier is 'Debe igualar bookings.closer (email del host de Calendly) para linkear el closer logueado con sus bookings.';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

grant all privileges on public.profiles to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Auto-crear el profile cuando se registra un usuario en auth.users
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Helpers SECURITY DEFINER (owner=postgres => bypassean RLS, sin recursión).
-- Devuelven null/false si el usuario no está activo => profile desactivado pierde
-- todo acceso.
-- -----------------------------------------------------------------------------
create or replace function public.current_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid() and activo = true;
$$;

create or replace function public.current_closer_identifier()
returns text language sql stable security definer set search_path = public as $$
  select closer_identifier from public.profiles where id = auth.uid() and activo = true;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from public.profiles where id = auth.uid() and activo = true), false);
$$;

-- ¿el lead está en crisis? (para excluir sus bookings/calls de las vistas comerciales)
create or replace function public.lead_is_crisis(l_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select crisis from public.leads where id = l_id), false);
$$;

-- ¿el closer logueado tiene algún booking para este lead?
create or replace function public.closer_owns_lead(l_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.lead_id = l_id
      and b.closer = public.current_closer_identifier()
  );
$$;

-- ¿el booking es del closer logueado?
create or replace function public.closer_owns_booking(b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.id = b_id
      and b.closer = public.current_closer_identifier()
  );
$$;

-- ¿el lead del booking está en crisis?
create or replace function public.booking_lead_crisis(b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select l.crisis from public.bookings b join public.leads l on l.id = b.lead_id where b.id = b_id),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS: profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- RLS: leads
--   admin  -> todo
--   closer -> SELECT leads NO-crisis asociados a SUS bookings
--   setter -> SELECT todos los leads NO-crisis
-- -----------------------------------------------------------------------------
create policy leads_admin_all on public.leads
  for all using (public.is_admin()) with check (public.is_admin());

create policy leads_closer_select on public.leads
  for select using (
    public.current_rol() = 'closer'
    and crisis = false
    and public.closer_owns_lead(id)
  );

create policy leads_setter_select on public.leads
  for select using (
    public.current_rol() = 'setter'
    and crisis = false
  );

-- -----------------------------------------------------------------------------
-- RLS: bookings
--   closer -> SELECT/UPDATE sus bookings (excluyendo los de leads en crisis)
--   setter -> SELECT todos (excluyendo los de leads en crisis)
-- -----------------------------------------------------------------------------
create policy bookings_admin_all on public.bookings
  for all using (public.is_admin()) with check (public.is_admin());

create policy bookings_closer_select on public.bookings
  for select using (
    public.current_rol() = 'closer'
    and closer = public.current_closer_identifier()
    and not public.lead_is_crisis(lead_id)
  );

create policy bookings_closer_update on public.bookings
  for update using (
    public.current_rol() = 'closer'
    and closer = public.current_closer_identifier()
    and not public.lead_is_crisis(lead_id)
  ) with check (
    public.current_rol() = 'closer'
    and closer = public.current_closer_identifier()
  );

create policy bookings_setter_select on public.bookings
  for select using (
    public.current_rol() = 'setter'
    and not public.lead_is_crisis(lead_id)
  );

-- -----------------------------------------------------------------------------
-- RLS: calls
--   closer -> SELECT/INSERT/UPDATE calls de SUS bookings (no de leads en crisis)
--   setter -> sin acceso
-- -----------------------------------------------------------------------------
create policy calls_admin_all on public.calls
  for all using (public.is_admin()) with check (public.is_admin());

create policy calls_closer_select on public.calls
  for select using (
    public.current_rol() = 'closer'
    and public.closer_owns_booking(booking_id)
    and not public.booking_lead_crisis(booking_id)
  );

create policy calls_closer_insert on public.calls
  for insert with check (
    public.current_rol() = 'closer'
    and public.closer_owns_booking(booking_id)
    and not public.booking_lead_crisis(booking_id)
  );

create policy calls_closer_update on public.calls
  for update using (
    public.current_rol() = 'closer'
    and public.closer_owns_booking(booking_id)
  ) with check (
    public.current_rol() = 'closer'
    and public.closer_owns_booking(booking_id)
  );

-- -----------------------------------------------------------------------------
-- RLS: sales
--   closer -> SELECT sus ventas (por booking) + las sin matchear (conciliación);
--             INSERT (carga manual); UPDATE de las suyas o sin matchear.
--   setter -> SIN acceso (no ve montos).
-- -----------------------------------------------------------------------------
create policy sales_admin_all on public.sales
  for all using (public.is_admin()) with check (public.is_admin());

create policy sales_closer_select on public.sales
  for select using (
    public.current_rol() = 'closer'
    and (matcheada = false or public.closer_owns_booking(booking_id))
  );

create policy sales_closer_insert on public.sales
  for insert with check (public.current_rol() = 'closer');

create policy sales_closer_update on public.sales
  for update using (
    public.current_rol() = 'closer'
    and (matcheada = false or public.closer_owns_booking(booking_id))
  ) with check (public.current_rol() = 'closer');
