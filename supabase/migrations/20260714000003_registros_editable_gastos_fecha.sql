-- =============================================================================
-- Migración 0013 — #6: Registros editable + gastos con fecha propia
--
-- 1) updated_by en leads/bookings/calls/sales: quién hizo el último cambio manual
--    desde Registros. updated_at ya lo setea el trigger set_updated_at.
-- 2) gastos.fecha: cada gasto con su fecha propia (el modelo viejo agrupaba por
--    mes y perdía fecha/detalle). `periodo` se deriva de `fecha` por trigger para
--    no romper nada que aún lo use. dashboard_gastos(p_start,p_end) devuelve el
--    detalle fila por fila dentro del rango (Cashflow ahora es por rango).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. updated_by (auditoría de edición manual). uuid sin FK: es un rastro, la app
--    lo setea a auth.uid(). Null = lo escribió la ingestión, no una mano.
-- -----------------------------------------------------------------------------
alter table public.leads    add column if not exists updated_by uuid;
alter table public.bookings add column if not exists updated_by uuid;
alter table public.calls    add column if not exists updated_by uuid;
alter table public.sales    add column if not exists updated_by uuid;

comment on column public.leads.updated_by    is 'Último editor manual (auth.uid). Null = ingestión.';
comment on column public.bookings.updated_by is 'Último editor manual (auth.uid). Null = ingestión.';
comment on column public.calls.updated_by    is 'Último editor manual (auth.uid). Null = ingestión.';
comment on column public.sales.updated_by    is 'Último editor manual (auth.uid). Null = ingestión.';

-- -----------------------------------------------------------------------------
-- 2. gastos.fecha propia + periodo derivado.
-- -----------------------------------------------------------------------------
alter table public.gastos add column if not exists fecha date;
-- Backfill: los gastos viejos no tienen fecha → usar el primer día de su mes.
update public.gastos set fecha = periodo where fecha is null;
alter table public.gastos alter column fecha set not null;
alter table public.gastos alter column fecha set default current_date;

-- periodo pasa a derivarse de fecha (se mantiene como clave mensual para compat).
create or replace function public.gastos_set_periodo()
returns trigger language plpgsql set search_path = public as $$
begin
  new.periodo := date_trunc('month', new.fecha)::date;
  return new;
end;
$$;

drop trigger if exists trg_gastos_periodo on public.gastos;
create trigger trg_gastos_periodo
  before insert or update on public.gastos
  for each row execute function public.gastos_set_periodo();

create index if not exists idx_gastos_fecha on public.gastos (fecha);

-- -----------------------------------------------------------------------------
-- Detalle de gastos por rango (fila por fila). security invoker → solo admin (RLS
-- gastos_admin_all). El agrupado por categoría lo arma el frontend sobre estas
-- filas (igual que Cobranzas suma cuotas en el front).
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_gastos(p_start date, p_end date)
returns table (id uuid, fecha date, categoria text, concepto text, monto numeric)
language sql stable security invoker set search_path = public as $$
  select id, fecha, categoria, concepto, monto
  from public.gastos
  where fecha >= p_start and fecha < p_end
  order by fecha desc, created_at desc
$$;

grant execute on function public.dashboard_gastos(date, date) to authenticated, service_role;
