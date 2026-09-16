-- Tanda: panel de métricas y comisión del closer (análogo al de la setter).
--
-- La closer (Betina) cobra 10% del cash collected de SUS ventas. A diferencia
-- de la setter (que no tiene policy sobre sales/payments y por eso necesitó un
-- RPC SECURITY DEFINER), el rol closer SÍ tiene SELECT propio sobre bookings,
-- calls, sales y payments (ver auth_roles_rls.sql / deals_payments_metas_gastos.sql)
-- vía closer_owns_booking()/closer_owns_sale(). Por eso esta función alcanza con
-- SECURITY INVOKER: RLS ya restringe lo que puede leer.
--
-- Aun así, filtra EXPLÍCITAMENTE por bookings.closer = current_closer_identifier()
-- en vez de confiar solo en RLS, por dos motivos:
--   1. sales_closer_select deja pasar filas con matcheada=false sin importar de
--      quién son (es a propósito, para conciliación) — sin el filtro explícito
--      se colarían ventas ajenas sin matchear en la suma de cash/comisión.
--   2. Se ancla contra bookings.closer (la fuente viva, la que corrige el
--      trigger de la Tanda 1) y no contra sales.closer (copia congelada al
--      momento del insert) — más confiable si alguna vez divergen.

-- ============================================================
-- % de comisión centralizado, mismo patrón que la fecha de corte
-- de la Tanda 1: un solo lugar para cambiarlo.
-- ============================================================

create or replace function public.closer_pct_comision()
returns numeric
language sql
immutable
as $$ select 0.10 $$; -- 10% del cash collected

comment on function public.closer_pct_comision() is
  'Porcentaje de comisión del closer sobre el cash collected. Único lugar para cambiarlo.';

-- ============================================================
-- Métricas + comisión de "mis" llamadas/ventas/cash como closer.
-- ============================================================

create or replace function public.dashboard_closer_metricas(p_start date, p_end date)
returns table (
  llamadas             bigint,
  atendidas            bigint,
  resueltas            bigint,
  show_rate            numeric,
  ventas               bigint,
  ventas_atribuibles   bigint,
  close_rate_atendidas numeric,
  cash_collected       numeric,
  pct_comision         numeric,
  comision             numeric
)
language sql stable security invoker set search_path = public as $$
  with
  book_agg as (
    select
      count(*) filter (where b.estado not in ('cancelada','reprogramada')) as llamadas,
      count(*) filter (where b.estado = 'atendida') as atendidas,
      count(*) filter (where b.estado in ('atendida','no_show')) as resueltas
    from public.bookings b
    where b.closer = public.current_closer_identifier()
      and not exists (select 1 from public.leads l where l.id = b.lead_id and l.crisis)
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
  ),
  -- Ancla en bookings.closer (join), no en sales.closer: excluye de paso las
  -- filas matcheada=false que no son del closer (el agujero que había que tapar).
  sale_agg as (
    select
      count(*) filter (where exists (
        select 1 from public.bookings bk where bk.id = s.booking_id and bk.estado = 'atendida'
      )) as ventas_atrib,
      count(*) as ventas
    from public.sales s
    where s.booking_id is not null
      and exists (
        select 1 from public.bookings bk
        where bk.id = s.booking_id and bk.closer = public.current_closer_identifier()
      )
      and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
      and s.fecha_cierre >= p_start and s.fecha_cierre < p_end
  ),
  cash_agg as (
    select coalesce(sum(pm.monto), 0) as cash
    from public.payments pm
    join public.sales s on s.id = pm.sale_id
    join public.bookings bk on bk.id = s.booking_id
    where bk.closer = public.current_closer_identifier()
      and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
      and pm.fecha >= p_start and pm.fecha < p_end
  )
  select
    ba.llamadas,
    ba.atendidas,
    ba.resueltas,
    ba.atendidas::numeric / nullif(ba.resueltas, 0),
    sa.ventas,
    sa.ventas_atrib,
    sa.ventas_atrib::numeric / nullif(ba.atendidas, 0),
    ca.cash,
    public.closer_pct_comision(),
    round(ca.cash * public.closer_pct_comision(), 2)
  from book_agg ba, sale_agg sa, cash_agg ca
$$;

grant execute on function public.dashboard_closer_metricas(date, date) to authenticated, service_role;
