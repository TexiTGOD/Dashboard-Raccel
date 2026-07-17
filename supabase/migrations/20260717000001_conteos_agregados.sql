-- =============================================================================
-- Migración 0015 — Tanda 3.2: conteos agregados en la base (blindaje de volumen)
--
-- Problema: varias pantallas traían FILAS solo para contarlas en el front
-- (leads.length, grupos por estado). PostgREST corta en 1000 filas por defecto,
-- así que con miles de leads esos conteos quedaban truncados/incorrectos. La
-- regla del proyecto es cálculo en la base: un `count()` agregado no tiene el
-- límite de 1000 y es correcto con cualquier volumen.
--
-- Dos funciones nuevas (solo lectura, aditivas — no tocan schema ni funciones
-- existentes):
--   dashboard_rows_counts(p_start, p_end)  → totales por tab de Registros.
--   dashboard_setter_pipeline()            → conteos del Pipeline del setter.
--
-- Los filtros REPLICAN EXACTAMENTE los de las dashboard_rows_* (misma exclusión
-- de crisis, misma columna de fecha, mismo rango [p_start, p_end)), así el total
-- de cada tab == cantidad/suma real de las filas que muestra.
-- security invoker: corren con la RLS del que llama (igual que las rows_*).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Totales por tab de Registros (una sola fila). Cuadran 1:1 con:
--   leads_count        ↔ dashboard_rows_leads
--   llamadas_count     ↔ dashboard_rows_llamadas
--   ventas_count       ↔ dashboard_rows_ventas  (+ facturación y cash sumados)
--   pagos_count        ↔ dashboard_rows_pagos   (+ cash sumado)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_rows_counts(p_start date, p_end date)
returns table (
  leads_count         bigint,
  llamadas_count      bigint,
  ventas_count        bigint,
  ventas_facturacion  numeric,
  ventas_cash         numeric,
  pagos_count         bigint,
  pagos_cash          numeric
)
language sql stable security invoker set search_path = public as $$
  select
    -- leads: crisis=false, ancla fecha_primer_contacto (= dashboard_rows_leads)
    (select count(*)
       from public.leads l
      where l.crisis = false
        and l.fecha_primer_contacto >= p_start and l.fecha_primer_contacto < p_end),

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
    -- (idéntico a la columna cash_collected de dashboard_rows_ventas)
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
        and pm.fecha >= p_start and pm.fecha < p_end), 0)
$$;

-- -----------------------------------------------------------------------------
-- Pipeline del setter: conteos por bucket de estado_funnel + total + agendas.
-- El bucketing replica normEstado() del front (setter/page.tsx): prioridad
-- calificado > zona_gris > descalificado > fría > otro. Sin filtro de período
-- (la pantalla muestra todo el pipeline, igual que el fetch actual).
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_setter_pipeline()
returns table (
  total          bigint,
  calificado     bigint,
  zona_gris      bigint,
  descalificado  bigint,
  fria           bigint,
  otro           bigint,
  agendas        bigint
)
language sql stable security invoker set search_path = public as $$
  with buckets as (
    select case
      -- normEstado: includes('calific') && !includes('des')
      when estado_funnel ilike '%calific%' and estado_funnel not ilike '%des%' then 'calificado'
      when estado_funnel ilike '%gris%'                                        then 'zona_gris'
      when estado_funnel ilike '%descalif%'                                    then 'descalificado'
      when estado_funnel ilike '%fria%' or estado_funnel ilike '%fría%'        then 'fria'
      else 'otro'
    end as b
    from public.leads
    where crisis = false
  )
  select
    (select count(*) from buckets),
    count(*) filter (where b = 'calificado'),
    count(*) filter (where b = 'zona_gris'),
    count(*) filter (where b = 'descalificado'),
    count(*) filter (where b = 'fria'),
    count(*) filter (where b = 'otro'),
    (select count(*) from public.bookings)
  from buckets
$$;

grant execute on function public.dashboard_rows_counts(date, date) to authenticated, service_role;
grant execute on function public.dashboard_setter_pipeline()       to authenticated, service_role;
