-- =============================================================================
-- Migración 0016 — Tanda 3.2: orden TOTAL en las dashboard_rows_* (paginación)
--
-- Registros trae las filas por chunks con .range(offset, …) para superar el cap
-- de 1000 filas de PostgREST y recorrer TODO el volumen. Para que el paginado por
-- range no duplique ni saltee filas en los bordes de chunk, el ORDER BY tiene que
-- ser TOTAL (determinístico). Hoy ordenan solo por fecha, y hay cientos de leads
-- con la misma fecha_primer_contacto → orden ambiguo entre empates.
--
-- Fix: agregar el id (PK, único) como desempate. Único cambio: el ORDER BY. Las
-- columnas, joins y filtros quedan idénticos (no toca métricas ni conteos).
-- =============================================================================

create or replace function public.dashboard_rows_pagos(p_start date, p_end date)
returns table (
  payment_id uuid, fecha timestamptz, monto numeric, moneda text,
  metodo_pago text, numero_cuota smallint, comprador text, producto text,
  sale_id uuid, booking_id uuid
)
language sql stable security invoker set search_path = public as $$
  select pm.id, pm.fecha, pm.monto, pm.moneda, pm.metodo_pago, pm.numero_cuota,
         sl.nombre_comprador, sl.producto, sl.id, sl.booking_id
  from public.payments pm
  join public.sales sl on sl.id = pm.sale_id
  where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
    and pm.fecha >= p_start and pm.fecha < p_end
  order by pm.fecha desc, pm.id desc
$$;

create or replace function public.dashboard_rows_ventas(p_start date, p_end date)
returns table (
  sale_id uuid, fecha timestamptz, comprador text, producto text,
  valor_contrato numeric, cash_collected numeric, moneda text, closer text,
  booking_id uuid
)
language sql stable security invoker set search_path = public as $$
  select sl.id, sl.created_at, sl.nombre_comprador, sl.producto,
         sl.valor_contrato,
         coalesce((select sum(p.monto) from public.payments p where p.sale_id = sl.id), 0),
         sl.moneda, sl.closer, sl.booking_id
  from public.sales sl
  where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
    and sl.created_at >= p_start and sl.created_at < p_end
  order by sl.created_at desc, sl.id desc
$$;

create or replace function public.dashboard_rows_llamadas(p_start date, p_end date)
returns table (
  booking_id uuid, fecha timestamptz, lead_nombre text, ig text,
  closer text, estado text, resultado text, pieza text
)
language sql stable security invoker set search_path = public as $$
  select b.id, b.fecha_llamada,
         coalesce(l.nombre, b.nombre), coalesce(l.ig_username, b.ig_username),
         b.closer, b.estado,
         (select c.resultado from public.calls c where c.booking_id = b.id order by c.created_at desc limit 1),
         l.pieza_origen
  from public.bookings b
  left join public.leads l on l.id = b.lead_id
  where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
    and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
  order by b.fecha_llamada desc, b.id desc
$$;

create or replace function public.dashboard_rows_leads(p_start date, p_end date)
returns table (
  lead_id uuid, fecha timestamptz, nombre text, ig text, pieza text,
  dolor text, conciencia smallint, econ_calificacion text, estado_funnel text,
  booking_id uuid
)
language sql stable security invoker set search_path = public as $$
  select l.id, l.fecha_primer_contacto, l.nombre, l.ig_username, l.pieza_origen,
         l.dolor, l.conciencia, l.econ_calificacion, l.estado_funnel,
         (select b.id from public.bookings b where b.lead_id = l.id order by b.fecha_llamada desc limit 1)
  from public.leads l
  where l.crisis = false
    and l.fecha_primer_contacto >= p_start and l.fecha_primer_contacto < p_end
  order by l.fecha_primer_contacto desc, l.id desc
$$;
