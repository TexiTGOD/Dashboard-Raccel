-- =============================================================================
-- Migración 0006 — Fase C.2: funciones de métricas del dashboard
--
-- Una definición por métrica, en la base (no en el front). Todas:
--  - EXCLUYEN crisis=true explícitamente (el admin ve los leads en crisis, pero
--    NO existen para el embudo comercial).
--  - Son SECURITY INVOKER: corren con la RLS del que llama. El dashboard de
--    Operaciones es admin (ve todo). Un no-admin que las llame recibe su vista
--    RLS (no es un leak).
--  - show-up rate: solo cuentan llamadas cuya fecha YA PASÓ (una booking futura
--    no es un no-show).
--
-- Anclas de período:
--   leads      -> fecha_primer_contacto
--   bookings   -> fecha_llamada
--   sales      -> created_at  (proxy de fecha de cierre; no hay columna dedicada)
--   payments   -> fecha       (cash collected)
-- Rango半-abierto [p_start, p_end).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- KPIs + embudo del período
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_kpis(p_start date, p_end date)
returns table (
  leads                 bigint,
  calificados           bigint,
  agendas               bigint,
  atendidas             bigint,
  no_show               bigint,
  ventas                bigint,
  facturacion           numeric,
  cash_collected        numeric,
  aov                   numeric,
  tasa_calificacion     numeric,
  tasa_agenda           numeric,
  show_rate             numeric,
  close_rate_atendidas  numeric,
  close_rate_agendadas  numeric
)
language sql stable security invoker set search_path = public as $$
  with
  l as (
    select * from public.leads
    where crisis = false
      and fecha_primer_contacto >= p_start and fecha_primer_contacto < p_end
  ),
  b as (
    select bk.* from public.bookings bk
    where not exists (select 1 from public.leads ld where ld.id = bk.lead_id and ld.crisis)
      and bk.fecha_llamada >= p_start and bk.fecha_llamada < p_end
  ),
  s as (
    select sl.* from public.sales sl
    where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
      and sl.created_at >= p_start and sl.created_at < p_end
  ),
  pay as (
    select pm.* from public.payments pm
    join public.sales sl on sl.id = pm.sale_id
    where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
      and pm.fecha >= p_start and pm.fecha < p_end
  ),
  agg as (
    select
      (select count(*) from l)                                                    as leads,
      (select count(*) from l where econ_calificacion = 'calificada')             as calificados,
      (select count(*) from b)                                                    as agendas,
      (select count(*) from b where estado = 'atendida')                          as atendidas,
      (select count(*) from b where estado = 'no_show' and fecha_llamada < now()) as no_show,
      -- show-up: solo llamadas ya pasadas
      (select count(*) from b where estado = 'atendida' and fecha_llamada < now()) as atendidas_pasadas,
      (select count(*) from b where estado in ('atendida','no_show') and fecha_llamada < now()) as pasadas,
      (select count(*) from s)                                                    as ventas,
      coalesce((select sum(valor_contrato) from s), 0)                            as facturacion,
      coalesce((select sum(monto) from pay), 0)                                   as cash_collected
  )
  select
    leads, calificados, agendas, atendidas, no_show, ventas, facturacion, cash_collected,
    case when ventas > 0 then facturacion / ventas else 0 end,
    case when leads  > 0 then calificados::numeric / leads else 0 end,
    case when leads  > 0 then agendas::numeric / leads else 0 end,
    case when pasadas > 0 then atendidas_pasadas::numeric / pasadas else 0 end,
    case when atendidas > 0 then ventas::numeric / atendidas else 0 end,
    case when agendas   > 0 then ventas::numeric / agendas   else 0 end
  from agg
$$;

-- -----------------------------------------------------------------------------
-- Atribución por pieza de contenido  ← LA vista
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_atribucion(p_start date, p_end date)
returns table (
  pieza_origen   text,
  leads          bigint,
  calificados    bigint,
  agendas        bigint,
  atendidas      bigint,
  ventas         bigint,
  facturacion    numeric,
  cash_collected numeric,
  cash_por_lead  numeric
)
language sql stable security invoker set search_path = public as $$
  with
  lead_agg as (
    select pieza_origen,
      count(*) as leads,
      count(*) filter (where econ_calificacion = 'calificada') as calificados
    from public.leads
    where crisis = false and pieza_origen is not null
      and fecha_primer_contacto >= p_start and fecha_primer_contacto < p_end
    group by pieza_origen
  ),
  book_agg as (
    select l.pieza_origen,
      count(*) as agendas,
      count(*) filter (where b.estado = 'atendida') as atendidas
    from public.bookings b
    join public.leads l on l.id = b.lead_id
    where l.crisis = false and l.pieza_origen is not null
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
    group by l.pieza_origen
  ),
  sale_agg as (
    select l.pieza_origen,
      count(*) as ventas,
      coalesce(sum(s.valor_contrato), 0) as facturacion
    from public.sales s
    join public.leads l on l.id = s.lead_id
    where l.crisis = false and l.pieza_origen is not null
      and s.created_at >= p_start and s.created_at < p_end
    group by l.pieza_origen
  ),
  cash_agg as (
    select l.pieza_origen, coalesce(sum(p.monto), 0) as cash_collected
    from public.payments p
    join public.sales s on s.id = p.sale_id
    join public.leads l on l.id = s.lead_id
    where l.crisis = false and l.pieza_origen is not null
      and p.fecha >= p_start and p.fecha < p_end
    group by l.pieza_origen
  ),
  piezas as (
    select pieza_origen from lead_agg
    union select pieza_origen from book_agg
    union select pieza_origen from sale_agg
    union select pieza_origen from cash_agg
  )
  select
    pz.pieza_origen,
    coalesce(la.leads, 0), coalesce(la.calificados, 0),
    coalesce(ba.agendas, 0), coalesce(ba.atendidas, 0),
    coalesce(sa.ventas, 0), coalesce(sa.facturacion, 0),
    coalesce(ca.cash_collected, 0),
    case when coalesce(la.leads, 0) > 0 then coalesce(ca.cash_collected, 0) / la.leads else 0 end
  from piezas pz
  left join lead_agg la on la.pieza_origen = pz.pieza_origen
  left join book_agg ba on ba.pieza_origen = pz.pieza_origen
  left join sale_agg sa on sa.pieza_origen = pz.pieza_origen
  left join cash_agg ca on ca.pieza_origen = pz.pieza_origen
  order by 8 desc
$$;

-- -----------------------------------------------------------------------------
-- Corte por dolor
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_por_dolor(p_start date, p_end date)
returns table (
  dolor       text,
  leads       bigint,
  agendas     bigint,
  ventas      bigint,
  close_rate  numeric
)
language sql stable security invoker set search_path = public as $$
  with
  lead_agg as (
    select dolor, count(*) as leads
    from public.leads
    where crisis = false and dolor is not null
      and fecha_primer_contacto >= p_start and fecha_primer_contacto < p_end
    group by dolor
  ),
  book_agg as (
    select l.dolor,
      count(*) as agendas,
      count(*) filter (where b.estado = 'atendida') as atendidas
    from public.bookings b join public.leads l on l.id = b.lead_id
    where l.crisis = false and l.dolor is not null
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
    group by l.dolor
  ),
  sale_agg as (
    select l.dolor, count(*) as ventas
    from public.sales s join public.leads l on l.id = s.lead_id
    where l.crisis = false and l.dolor is not null
      and s.created_at >= p_start and s.created_at < p_end
    group by l.dolor
  ),
  dims as (
    select dolor from lead_agg union select dolor from book_agg union select dolor from sale_agg
  )
  select d.dolor,
    coalesce(la.leads, 0), coalesce(ba.agendas, 0), coalesce(sa.ventas, 0),
    case when coalesce(ba.atendidas, 0) > 0 then coalesce(sa.ventas, 0)::numeric / ba.atendidas else 0 end
  from dims d
  left join lead_agg la on la.dolor = d.dolor
  left join book_agg ba on ba.dolor = d.dolor
  left join sale_agg sa on sa.dolor = d.dolor
  order by 4 desc
$$;

-- -----------------------------------------------------------------------------
-- Corte por nivel de conciencia (1-6)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_por_conciencia(p_start date, p_end date)
returns table (
  conciencia  smallint,
  leads       bigint,
  agendas     bigint,
  ventas      bigint,
  close_rate  numeric
)
language sql stable security invoker set search_path = public as $$
  with
  lead_agg as (
    select conciencia, count(*) as leads
    from public.leads
    where crisis = false and conciencia is not null
      and fecha_primer_contacto >= p_start and fecha_primer_contacto < p_end
    group by conciencia
  ),
  book_agg as (
    select l.conciencia,
      count(*) as agendas,
      count(*) filter (where b.estado = 'atendida') as atendidas
    from public.bookings b join public.leads l on l.id = b.lead_id
    where l.crisis = false and l.conciencia is not null
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
    group by l.conciencia
  ),
  sale_agg as (
    select l.conciencia, count(*) as ventas
    from public.sales s join public.leads l on l.id = s.lead_id
    where l.crisis = false and l.conciencia is not null
      and s.created_at >= p_start and s.created_at < p_end
    group by l.conciencia
  ),
  dims as (
    select conciencia from lead_agg union select conciencia from book_agg union select conciencia from sale_agg
  )
  select d.conciencia,
    coalesce(la.leads, 0), coalesce(ba.agendas, 0), coalesce(sa.ventas, 0),
    case when coalesce(ba.atendidas, 0) > 0 then coalesce(sa.ventas, 0)::numeric / ba.atendidas else 0 end
  from dims d
  left join lead_agg la on la.conciencia = d.conciencia
  left join book_agg ba on ba.conciencia = d.conciencia
  left join sale_agg sa on sa.conciencia = d.conciencia
  order by d.conciencia
$$;

-- -----------------------------------------------------------------------------
-- Performance por closer
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_por_closer(p_start date, p_end date)
returns table (
  closer       text,
  llamadas     bigint,
  atendidas    bigint,
  no_show      bigint,
  show_rate    numeric,
  ventas       bigint,
  facturacion  numeric,
  aov          numeric,
  close_rate   numeric
)
language sql stable security invoker set search_path = public as $$
  with
  book_agg as (
    select b.closer,
      count(*) as llamadas,
      count(*) filter (where b.estado = 'atendida') as atendidas,
      count(*) filter (where b.estado = 'no_show' and b.fecha_llamada < now()) as no_show,
      count(*) filter (where b.estado = 'atendida' and b.fecha_llamada < now()) as atendidas_pasadas,
      count(*) filter (where b.estado in ('atendida','no_show') and b.fecha_llamada < now()) as pasadas
    from public.bookings b
    where b.closer is not null
      and not exists (select 1 from public.leads l where l.id = b.lead_id and l.crisis)
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
    group by b.closer
  ),
  sale_agg as (
    select s.closer,
      count(*) as ventas,
      coalesce(sum(s.valor_contrato), 0) as facturacion
    from public.sales s
    where s.closer is not null
      and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
      and s.created_at >= p_start and s.created_at < p_end
    group by s.closer
  ),
  dims as (
    select closer from book_agg union select closer from sale_agg
  )
  select d.closer,
    coalesce(ba.llamadas, 0), coalesce(ba.atendidas, 0), coalesce(ba.no_show, 0),
    case when coalesce(ba.pasadas, 0) > 0 then ba.atendidas_pasadas::numeric / ba.pasadas else 0 end,
    coalesce(sa.ventas, 0), coalesce(sa.facturacion, 0),
    case when coalesce(sa.ventas, 0) > 0 then sa.facturacion / sa.ventas else 0 end,
    case when coalesce(ba.atendidas, 0) > 0 then coalesce(sa.ventas, 0)::numeric / ba.atendidas else 0 end
  from dims d
  left join book_agg ba on ba.closer = d.closer
  left join sale_agg sa on sa.closer = d.closer
  order by 7 desc
$$;

-- =============================================================================
-- Registros — filas para el drill-down (sección Registros del dashboard).
-- USAN EXACTAMENTE EL MISMO filtro de período + exclusión de crisis que las
-- tarjetas, así SUM(rows_pagos.monto) == dashboard_kpis.cash_collected, etc.
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
  order by pm.fecha desc
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
  order by sl.created_at desc
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
  order by b.fecha_llamada desc
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
  order by l.fecha_primer_contacto desc
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
grant execute on function public.dashboard_kpis(date, date)           to authenticated, service_role;
grant execute on function public.dashboard_atribucion(date, date)     to authenticated, service_role;
grant execute on function public.dashboard_por_dolor(date, date)      to authenticated, service_role;
grant execute on function public.dashboard_por_conciencia(date, date) to authenticated, service_role;
grant execute on function public.dashboard_por_closer(date, date)     to authenticated, service_role;
grant execute on function public.dashboard_rows_pagos(date, date)     to authenticated, service_role;
grant execute on function public.dashboard_rows_ventas(date, date)    to authenticated, service_role;
grant execute on function public.dashboard_rows_llamadas(date, date)  to authenticated, service_role;
grant execute on function public.dashboard_rows_leads(date, date)     to authenticated, service_role;
