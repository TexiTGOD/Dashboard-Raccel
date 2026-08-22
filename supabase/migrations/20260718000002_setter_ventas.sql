-- =============================================================================
-- Migración 0026 — Agregados de venta para el tablero de la setter
--
-- La setter cobra 5% de comisión sobre el cash collected, así que necesita ver
-- ventas, cash y su comisión. Pero el rol `setter` NO tiene policy sobre
-- public.sales (a propósito: no ve datos de plata fila por fila), y todos los
-- dashboard_* son SECURITY INVOKER — si la setter los llama, esos números dan 0.
--
-- Solución: esta función es SECURITY DEFINER y devuelve SOLO AGREGADOS. La setter
-- obtiene sus números sin que se le abra el acceso crudo a la tabla sales.
--
-- Aislada a propósito: NO toca ninguna de las funciones DEFINER que sostienen las
-- policies de RLS (is_admin, current_rol, closer_owns_*, lead_is_crisis, …).
--
-- Las definiciones son las MISMAS que ya usa el resto del dashboard, para que los
-- números del tablero de la setter coincidan con Operaciones:
--   ventas               -> ancla sales.fecha_cierre, excluye leads en crisis (= dashboard_kpis)
--   ventas_atribuibles   -> ventas con booking atendido        (= dashboard_kpis)
--   close_rate_atendidas -> ventas_atribuibles / atendidas     (= dashboard_kpis)
--   cash_collected       -> suma de payments con ancla pm.fecha (= dashboard_kpis
--                           y dashboard_rows_counts.pagos_cash)
-- =============================================================================

-- El % de comisión va como PARÁMETRO con default, no enterrado en una fórmula:
-- queda en un solo lugar visible, se puede simular otro valor sin tocar la
-- función, y `pct_comision` se devuelve para que el frontend muestre la etiqueta
-- ("5% de X = Y") sin hardcodear el número en la UI.
create or replace function public.dashboard_setter_ventas(
  p_start    date,
  p_end      date,
  p_comision numeric default 0.05   -- 5% sobre el cash collected
)
returns table (
  ventas               bigint,
  ventas_atribuibles   bigint,
  atendidas            bigint,
  cash_collected       numeric,
  close_rate_atendidas numeric,
  pct_comision         numeric,
  comision             numeric
)
language sql stable security definer set search_path = public as $$
  with
  -- Ventas del período: mismo filtro y misma ancla (fecha_cierre) que dashboard_kpis.
  s as (
    select sl.id, sl.booking_id
    from public.sales sl
    where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
      and sl.fecha_cierre >= p_start and sl.fecha_cierre < p_end
  ),
  -- Denominador del close rate: atendidas del período (mismo filtro que dashboard_kpis).
  at as (
    select count(*) as n
    from public.bookings bk
    where not exists (select 1 from public.leads ld where ld.id = bk.lead_id and ld.crisis)
      and bk.fecha_llamada >= p_start and bk.fecha_llamada < p_end
      and bk.estado = 'atendida'
  ),
  agg as (
    select
      (select count(*) from s) as ventas,
      (select count(*) from s
        where s.booking_id is not null
          and exists (select 1 from public.bookings bk
                       where bk.id = s.booking_id and bk.estado = 'atendida')
      ) as ventas_atribuibles,
      (select n from at) as atendidas,
      -- Cash Collected: idéntico a dashboard_kpis / dashboard_rows_counts.pagos_cash.
      coalesce((select sum(pm.monto)
         from public.payments pm
         join public.sales s2 on s2.id = pm.sale_id
        where not exists (select 1 from public.leads ld where ld.id = s2.lead_id and ld.crisis)
          and pm.fecha >= p_start and pm.fecha < p_end), 0) as cash_collected
  )
  select
    ventas,
    ventas_atribuibles,
    atendidas,
    cash_collected,
    ventas_atribuibles::numeric / nullif(atendidas, 0),
    p_comision,
    round(cash_collected * p_comision, 2)
  from agg
$$;

-- Mismo patrón que el resto de las funciones DEFINER del proyecto: fuera de anon
-- y de public; authenticated (la setter y el admin) la puede ejecutar.
revoke all on function public.dashboard_setter_ventas(date, date, numeric) from public, anon;
grant execute on function public.dashboard_setter_ventas(date, date, numeric) to authenticated, service_role;
