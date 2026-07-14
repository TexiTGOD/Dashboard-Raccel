-- =============================================================================
-- Migración 0010 — #3 (calificación sobre responders) + #4 (tasas históricas)
--
-- #3: % de calificación = calificada / (calificada + no_calificada). Los NULL
--     (no respondieron el flujo de ManyChat) NO van al denominador: se cuentan
--     aparte (sin_responder). Nunca puede pasar de 100%. Mismo principio que el
--     show-rate con las pendientes.
-- #4: dashboard_tasas_historicas() — las 5 tasas reales de los últimos 90 días,
--     para prellenar la cascada de metas (ingeniería inversa desde el cash).
-- =============================================================================

drop function if exists public.dashboard_kpis(date, date);
create function public.dashboard_kpis(p_start date, p_end date)
returns table (
  leads                 bigint,
  calificados           bigint,
  no_calificados        bigint,
  sin_responder         bigint,
  agendas               bigint,
  atendidas             bigint,
  no_show               bigint,
  resueltas             bigint,
  pendientes            bigint,
  canceladas            bigint,
  ventas                bigint,
  ventas_atribuibles    bigint,
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
    where crisis = false and fecha_primer_contacto >= p_start and fecha_primer_contacto < p_end
  ),
  b as (
    select bk.*,
      case
        when bk.estado in ('cancelada','reprogramada') then 'cancelada'
        when bk.estado in ('atendida','no_show') then 'resuelta'
        when bk.fecha_llamada >= now() then 'futura'
        else 'pendiente_desenlace'
      end as clase
    from public.bookings bk
    where not exists (select 1 from public.leads ld where ld.id = bk.lead_id and ld.crisis)
      and bk.fecha_llamada >= p_start and bk.fecha_llamada < p_end
  ),
  bc as (
    select count(distinct l.id) as leads_agendaron
    from l join public.bookings bk on bk.lead_id = l.id
    where bk.estado not in ('cancelada','reprogramada')
  ),
  s as (
    select sl.* from public.sales sl
    where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
      and sl.fecha_cierre >= p_start and sl.fecha_cierre < p_end
  ),
  pay as (
    select pm.* from public.payments pm
    join public.sales sl on sl.id = pm.sale_id
    where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
      and pm.fecha >= p_start and pm.fecha < p_end
  ),
  agg as (
    select
      (select count(*) from l)                                          as leads,
      (select count(*) from l where econ_calificacion = 'calificada')   as calificados,
      (select count(*) from l where econ_calificacion = 'no_calificada') as no_calificados,
      (select count(*) from l where econ_calificacion is null)          as sin_responder,
      (select count(*) from b where clase <> 'cancelada')               as agendas,
      (select leads_agendaron from bc)                                  as leads_agendaron,
      (select count(*) from b where estado = 'atendida')                as atendidas,
      (select count(*) from b where estado = 'no_show')                 as no_show,
      (select count(*) from b where clase = 'resuelta')                 as resueltas,
      (select count(*) from b where clase = 'pendiente_desenlace')      as pendientes,
      (select count(*) from b where clase = 'cancelada')                as canceladas,
      (select count(*) from s)                                          as ventas,
      (select count(*) from s
        where s.booking_id is not null
          and exists (select 1 from public.bookings bk where bk.id = s.booking_id and bk.estado = 'atendida')
      )                                                                 as ventas_atribuibles,
      coalesce((select sum(valor_contrato) from s), 0)                  as facturacion,
      coalesce((select sum(monto) from pay), 0)                         as cash_collected
  )
  select
    leads, calificados, no_calificados, sin_responder, agendas, atendidas, no_show, resueltas,
    pendientes, canceladas, ventas, ventas_atribuibles, facturacion, cash_collected,
    facturacion / nullif(ventas, 0),
    -- % calificación SOLO sobre los que respondieron (calificada + no_calificada)
    calificados::numeric / nullif(calificados + no_calificados, 0),
    leads_agendaron::numeric / nullif(leads, 0),
    atendidas::numeric / nullif(resueltas, 0),
    ventas_atribuibles::numeric / nullif(atendidas, 0),
    ventas_atribuibles::numeric / nullif(agendas, 0)
  from agg
$$;

grant execute on function public.dashboard_kpis(date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- #4: tasas reales de los últimos 90 días (para prellenar la cascada de metas).
-- pct_cobrado = cash/facturación (cuánto del contrato entra como cash).
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_tasas_historicas()
returns table (
  pct_cobrado numeric, aov numeric, close_rate numeric, show_rate numeric, tasa_agenda numeric
)
language sql stable security invoker set search_path = public as $$
  select
    case when facturacion > 0 then cash_collected / facturacion else null end,
    aov, close_rate_atendidas, show_rate, tasa_agenda
  from public.dashboard_kpis((now() - interval '90 days')::date, now()::date);
$$;

grant execute on function public.dashboard_tasas_historicas() to authenticated, service_role;
