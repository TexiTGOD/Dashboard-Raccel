-- =============================================================================
-- Migración 0014 — Cierre Tanda 2
--
-- P1: Se elimina la conexión de Hotmart. Todo pago se carga a mano (Linda). El
--     matcheo automático venta↔llamada por email (el que generaba "ventas sin
--     matchear") ya no aplica: con el flujo manual la venta se crea pegada a la
--     llamada (booking_id no nulo). sales_match se reduce a normalizar el email y
--     mantener `matcheada`. NO se toca cuotas/payments/metodo_pago/hotmart_txid.
--
-- P3: Meta de facturación = ventas × precio del programa. El precio es un supuesto
--     editable en la cascada (no hardcodeado), prellenado con el valor de contrato
--     promedio del histórico (= aov facturación de dashboard_kpis). Se agrega
--     precio_prom al histórico y 'precio' a las métricas de metas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- P1 — sales_match sin auto-match por email (Hotmart fuera). Mantiene normalize
-- + matcheada. El trigger trg_sales_match (before insert/update) queda igual.
-- -----------------------------------------------------------------------------
create or replace function public.sales_match()
returns trigger language plpgsql as $$
begin
  new.email_comprador := public.normalize_email(new.email_comprador);
  -- matcheada = la venta quedó asociada a una llamada (carga manual desde el
  -- expediente). Sin Hotmart no hay ventas sin booking que reconciliar.
  new.matcheada := (new.booking_id is not null);
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- P3 — histórico con precio_prom (valor de contrato promedio) para prellenar el
-- supuesto de precio. precio_prom = aov (facturación / ventas) del período.
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_tasas_historicas(integer);
create function public.dashboard_tasas_historicas(p_dias integer default 90)
returns table (
  aov_cash numeric, precio_prom numeric, close_rate numeric, show_rate numeric, tasa_agenda numeric
)
language sql stable security invoker set search_path = public as $$
  select aov_cash, aov, close_rate_atendidas, show_rate, tasa_agenda
  from public.dashboard_kpis((now() - (p_dias || ' days')::interval)::date, now()::date);
$$;

grant execute on function public.dashboard_tasas_historicas(integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- P3 — 'precio' como métrica de meta válida (supuesto del precio del programa).
-- -----------------------------------------------------------------------------
alter table public.metas drop constraint metas_metrica_valida;
alter table public.metas add constraint metas_metrica_valida check (metrica in (
  'leads', 'tasa_agenda', 'agendas', 'show_rate', 'close_rate',
  'ventas', 'aov', 'precio', 'facturacion', 'cash_collected'
));
