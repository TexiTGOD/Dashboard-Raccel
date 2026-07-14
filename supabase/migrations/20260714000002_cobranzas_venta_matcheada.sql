-- =============================================================================
-- Migración 0012 — Corrección B: una venta SIN MATCHEAR no es cuenta por cobrar
--
-- B.1  Una venta sin booking_id (sin llamada) no sabemos a quién corresponde ni
--      si su cobro entró por otro lado. NO genera cuotas esperadas y NO aparece
--      en Cobranzas (ni mora, ni por-cobrar, ni cash proyectado). Cuando se la
--      vincula a una llamada (desde "Ventas sin matchear"), ahí sí se generan.
--
-- B.2  El generador de cuotas: parte el contrato en partes iguales y la ÚLTIMA
--      cuota absorbe el redondeo (así SUM(cuotas) == valor_contrato exacto).
--      Para pago único (cuotas_total = 1) la cuota 1 = contrato completo (era el
--      caso de la "Compradora Anónima": el monto estaba bien, faltaba etiquetarlo
--      como pago único — eso se resuelve en el frontend).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B.1 + B.2 — generador de cuotas: guard de booking_id + partición exacta.
-- Ahora dispara AFTER INSERT y AFTER UPDATE OF booking_id: cuando una venta sin
-- matchear se vincula (booking_id null → no null), se generan sus cuotas.
-- Idempotente (on conflict do nothing): un update posterior no duplica.
-- -----------------------------------------------------------------------------
create or replace function public.generate_cuotas()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cuotas_total is not null and new.cuotas_total >= 1
     and new.valor_contrato is not null
     and new.booking_id is not null then
    insert into public.cuotas (sale_id, numero_cuota, monto_esperado, fecha_vencimiento)
    select new.id, g,
           case
             when g < new.cuotas_total
               then round(new.valor_contrato / new.cuotas_total, 2)
             -- última cuota: el resto, para que la suma cierre exacta al contrato
             else new.valor_contrato - round(new.valor_contrato / new.cuotas_total, 2) * (new.cuotas_total - 1)
           end,
           coalesce(new.fecha_cierre, new.created_at, now()) + ((g - 1) || ' months')::interval
    from generate_series(1, new.cuotas_total) g
    on conflict (sale_id, numero_cuota) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_generate_cuotas on public.sales;
create trigger trg_generate_cuotas
  after insert or update of booking_id on public.sales
  for each row execute function public.generate_cuotas();

-- -----------------------------------------------------------------------------
-- Backfill de la regla: borrar las cuotas de ventas sin matchear que se hayan
-- generado con la regla vieja (p. ej. la "Compradora Anónima"). Sin payment_id
-- (no cobradas): son ruido, no una cuenta por cobrar real. Si alguna tuviera un
-- payment_id se conserva (ese cobro sí existió) — no debería haber ninguna.
-- -----------------------------------------------------------------------------
delete from public.cuotas c
 using public.sales s
 where s.id = c.sale_id
   and s.booking_id is null
   and c.payment_id is null;

-- -----------------------------------------------------------------------------
-- Cobranzas: mora. Se agrega el guard booking_id (defensa en profundidad) y
-- cuotas_total, para que el frontend distinga "pago único" de "cuota N/total".
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_mora();
create function public.dashboard_mora()
returns table (
  cuota_id uuid, sale_id uuid, numero_cuota smallint, cuotas_total smallint, monto_esperado numeric,
  fecha_vencimiento timestamptz, dias_vencida integer, comprador text, producto text, booking_id uuid
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.sale_id, c.numero_cuota, s.cuotas_total, c.monto_esperado, c.fecha_vencimiento,
         extract(day from (now() - c.fecha_vencimiento))::int,
         s.nombre_comprador, s.producto, s.booking_id
  from public.cuotas c
  join public.sales s on s.id = c.sale_id
  where c.payment_id is null
    and c.fecha_vencimiento < now()
    and s.booking_id is not null
    and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
  order by c.fecha_vencimiento asc
$$;

-- Cuotas que vencen en el período (cash proyectado + próximos vencimientos).
drop function if exists public.dashboard_cuotas_periodo(date, date);
create function public.dashboard_cuotas_periodo(p_start date, p_end date)
returns table (
  cuota_id uuid, sale_id uuid, numero_cuota smallint, cuotas_total smallint, monto_esperado numeric,
  fecha_vencimiento timestamptz, cobrada boolean, comprador text, producto text, booking_id uuid
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.sale_id, c.numero_cuota, s.cuotas_total, c.monto_esperado, c.fecha_vencimiento,
         (c.payment_id is not null), s.nombre_comprador, s.producto, s.booking_id
  from public.cuotas c
  join public.sales s on s.id = c.sale_id
  where c.fecha_vencimiento >= p_start and c.fecha_vencimiento < p_end
    and s.booking_id is not null
    and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
  order by c.fecha_vencimiento asc
$$;

grant execute on function public.dashboard_mora()                     to authenticated, service_role;
grant execute on function public.dashboard_cuotas_periodo(date, date) to authenticated, service_role;
