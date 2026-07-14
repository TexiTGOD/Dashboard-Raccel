-- =============================================================================
-- Migración 0011 — Corrección A: la cascada de metas es un solo eslabón de plata
--
-- La cascada tenía DOS supuestos de plata que se pisaban: "% cobrado al cierre"
-- (cash/facturación) y "AOV" (facturación/ventas). Con precio FIJO del programa,
-- la facturación por venta es constante: no es un supuesto. El único supuesto de
-- plata que importa es el AOV CASH = promedio de lo que realmente entra por venta
-- (ya captura el efecto de las cuotas). Reemplaza a los dos anteriores.
--
--   AOV cash = SUM(payments.monto) / COUNT(DISTINCT ventas con al menos un pago)
--
-- Cascada correcta:  cash ÷ aov_cash → ventas ÷ close → atendidas ÷ show →
--                    agendas ÷ tasa_agenda → leads.
--
-- Además: dashboard_tasas_historicas ahora toma una VENTANA (30/60/90 días) para
-- prellenar los supuestos con data reciente o más estable, y devuelve aov_cash en
-- lugar de aov/pct_cobrado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- dashboard_kpis: se agrega aov_cash (cash cobrado / ventas que cobraron algo).
-- El resto queda idéntico a 0010.
-- -----------------------------------------------------------------------------
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
  aov_cash              numeric,
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
      coalesce((select sum(monto) from pay), 0)                         as cash_collected,
      -- ventas (distintas) que cobraron al menos un pago en la ventana → denominador del AOV cash
      (select count(distinct sale_id) from pay)                         as ventas_con_pago
  )
  select
    leads, calificados, no_calificados, sin_responder, agendas, atendidas, no_show, resueltas,
    pendientes, canceladas, ventas, ventas_atribuibles, facturacion, cash_collected,
    facturacion / nullif(ventas, 0),                                    -- aov (ticket, facturación)
    cash_collected / nullif(ventas_con_pago, 0),                        -- aov_cash (plata real por venta)
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
-- Tasas históricas para prellenar la cascada, con VENTANA parametrizable.
-- Un solo supuesto de plata (aov_cash). Sin pct_cobrado (estaba adentro del AOV).
-- p_dias: 30 / 60 / 90 (default 90 = más estable).
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_tasas_historicas();
create function public.dashboard_tasas_historicas(p_dias integer default 90)
returns table (
  aov_cash numeric, close_rate numeric, show_rate numeric, tasa_agenda numeric
)
language sql stable security invoker set search_path = public as $$
  select aov_cash, close_rate_atendidas, show_rate, tasa_agenda
  from public.dashboard_kpis((now() - (p_dias || ' days')::interval)::date, now()::date);
$$;

grant execute on function public.dashboard_tasas_historicas(integer) to authenticated, service_role;
