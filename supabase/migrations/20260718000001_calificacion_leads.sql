-- =============================================================================
-- Migración 0025 — Tanda A: calificación de leads en 3 dimensiones (nuevo sistema)
--
-- Fuente de verdad: ManyChat. Cuando la setter/admin le pone una etiqueta al
-- contacto (Calificado_Dolor / Calificado_Urgencia / Calificado_Economica), una
-- automatización dispara un POST al webhook `calificacion-lead`, que prende acá
-- la columna correspondiente. El dashboard es SOLO LECTURA sobre estas columnas.
--
-- Aditiva: agrega columnas, una tabla de red de seguridad y extiende dos RPCs de
-- lectura. NO toca el sistema VIEJO de calificación (leads.dolor,
-- leads.conciencia, leads.econ_calificacion), que se retira en tandas posteriores.
--
-- OJO con los nombres: `econ_calificacion` (vieja, text) NO es lo mismo que
-- `calificado_economica` (nueva, boolean). Son sistemas distintos.
--
-- ORDEN: esta migración va ANTES de desplegar el webhook. El webhook escribe estas
-- columnas; si todavía no existen, cada request falla.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las 3 dimensiones. NOT NULL default false: "todavía no calificado" y "no
--    califica" no se distinguen — el sistema solo PRENDE tildes desde ManyChat.
-- -----------------------------------------------------------------------------
alter table public.leads add column if not exists calificado_dolor      boolean not null default false;
alter table public.leads add column if not exists calificado_urgencia   boolean not null default false;
alter table public.leads add column if not exists calificado_economica  boolean not null default false;

comment on column public.leads.calificado_dolor is
  'Etiqueta Calificado_Dolor puesta en ManyChat. La prende el webhook calificacion-lead; el dashboard solo la lee.';
comment on column public.leads.calificado_urgencia is
  'Etiqueta Calificado_Urgencia puesta en ManyChat. La prende el webhook calificacion-lead; el dashboard solo la lee.';
comment on column public.leads.calificado_economica is
  'Etiqueta Calificado_Economica puesta en ManyChat. Distinta de la columna vieja econ_calificacion.';

-- Los contadores del período filtran por estas columnas sobre leads no-crisis.
create index if not exists idx_leads_calificado_dolor     on public.leads (calificado_dolor)     where calificado_dolor;
create index if not exists idx_leads_calificado_urgencia  on public.leads (calificado_urgencia)  where calificado_urgencia;
create index if not exists idx_leads_calificado_economica on public.leads (calificado_economica) where calificado_economica;

-- -----------------------------------------------------------------------------
-- 2. Red de seguridad: calificaciones que no matchearon ningún lead. NO es el
--    caso esperado; queda para revisión manual (no se crea un lead nuevo).
-- -----------------------------------------------------------------------------
create table if not exists public.calificaciones_sin_match (
  id                  uuid        primary key default gen_random_uuid(),
  manychat_contact_id text,
  ig_username         text,
  calificacion        text        not null,
  payload             jsonb,
  created_at          timestamptz not null default now()
);

comment on table public.calificaciones_sin_match is
  'Calificaciones de ManyChat que no matchearon ningún lead. Red de seguridad para revisión manual.';

alter table public.calificaciones_sin_match enable row level security;

-- Solo admin la ve. El webhook escribe con service_role (bypassea RLS).
drop policy if exists csm_admin_all on public.calificaciones_sin_match;
create policy csm_admin_all on public.calificaciones_sin_match
  for all using (public.is_admin()) with check (public.is_admin());

grant all privileges on public.calificaciones_sin_match to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. dashboard_rows_leads: agrega las 3 columnas nuevas al final.
--    Cambia el tipo de retorno => hay que DROP + CREATE (create or replace no
--    puede cambiar la firma). Cuerpo y orden idénticos a la 0016.
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_rows_leads(date, date);
create function public.dashboard_rows_leads(p_start date, p_end date)
returns table (
  lead_id uuid, fecha timestamptz, nombre text, ig text, pieza text,
  dolor text, conciencia smallint, econ_calificacion text, estado_funnel text,
  booking_id uuid,
  calificado_dolor boolean, calificado_urgencia boolean, calificado_economica boolean
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.fecha_primer_contacto, l.nombre, l.ig_username, l.pieza_origen,
         l.dolor, l.conciencia, l.econ_calificacion, l.estado_funnel,
         (select b.id from public.bookings b where b.lead_id = l.id order by b.fecha_llamada desc limit 1),
         l.calificado_dolor, l.calificado_urgencia, l.calificado_economica
  from public.leads l
  where l.crisis = false
    and l.fecha_primer_contacto >= p_start and l.fecha_primer_contacto < p_end
  order by l.fecha_primer_contacto desc, l.id desc
$$;

grant execute on function public.dashboard_rows_leads(date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. dashboard_rows_counts: agrega los 4 contadores de calificación del período.
--    Mismo filtro que el conteo de leads (crisis=false + fecha_primer_contacto),
--    así los 4 números son subconjuntos de leads_count.
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_rows_counts(date, date);
create function public.dashboard_rows_counts(p_start date, p_end date)
returns table (
  leads_count         bigint,
  llamadas_count      bigint,
  ventas_count        bigint,
  ventas_facturacion  numeric,
  ventas_cash         numeric,
  pagos_count         bigint,
  pagos_cash          numeric,
  calif_dolor         bigint,
  calif_urgencia      bigint,
  calif_economica     bigint,
  calif_las_tres      bigint
)
language sql stable security invoker set search_path = public as $$
  with leads_periodo as (
    select l.calificado_dolor, l.calificado_urgencia, l.calificado_economica
    from public.leads l
    where l.crisis = false
      and l.fecha_primer_contacto >= p_start and l.fecha_primer_contacto < p_end
  )
  select
    -- leads: crisis=false, ancla fecha_primer_contacto (= dashboard_rows_leads)
    (select count(*) from leads_periodo),

    -- llamadas: lead no-crisis, ancla fecha_llamada (= dashboard_rows_llamadas)
    (select count(*)
       from public.bookings b
      where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
        and b.fecha_llamada >= p_start and b.fecha_llamada < p_end),

    -- ventas: lead no-crisis, ancla created_at (= dashboard_rows_ventas)
    (select count(*)
       from public.sales sl
      where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
        and sl.created_at >= p_start and sl.created_at < p_end),

    -- facturación = sum(valor_contrato) de esas ventas
    coalesce((select sum(sl.valor_contrato)
       from public.sales sl
      where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
        and sl.created_at >= p_start and sl.created_at < p_end), 0),

    -- cash de ventas = por cada venta en rango, la suma de TODOS sus pagos
    coalesce((select sum(cash_por_venta) from (
       select coalesce((select sum(p.monto) from public.payments p where p.sale_id = sl.id), 0) as cash_por_venta
       from public.sales sl
       where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
         and sl.created_at >= p_start and sl.created_at < p_end
    ) t), 0),

    -- pagos: pago cuyo sale.lead no-crisis, ancla pm.fecha (= dashboard_rows_pagos)
    (select count(*)
       from public.payments pm
       join public.sales s2 on s2.id = pm.sale_id
      where not exists (select 1 from public.leads ld where ld.id = s2.lead_id and ld.crisis)
        and pm.fecha >= p_start and pm.fecha < p_end),

    -- cash de pagos = sum(monto) de esos pagos (= Cash Collected del período)
    coalesce((select sum(pm.monto)
       from public.payments pm
       join public.sales s2 on s2.id = pm.sale_id
      where not exists (select 1 from public.leads ld where ld.id = s2.lead_id and ld.crisis)
        and pm.fecha >= p_start and pm.fecha < p_end), 0),

    -- calificación (nuevo sistema): subconjuntos de leads_count
    (select count(*) from leads_periodo where calificado_dolor),
    (select count(*) from leads_periodo where calificado_urgencia),
    (select count(*) from leads_periodo where calificado_economica),
    (select count(*) from leads_periodo
      where calificado_dolor and calificado_urgencia and calificado_economica)
$$;

grant execute on function public.dashboard_rows_counts(date, date) to authenticated, service_role;
