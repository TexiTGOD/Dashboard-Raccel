-- =============================================================================
-- Migración 0008 — Tanda 1 (pendiente #1): no cerrar una venta contra una
-- llamada futura.
--
-- La constraint inmutable (fecha_cierre >= fecha_llamada) queda igual, en el
-- trigger. La regla dependiente del tiempo (la llamada ya tiene que haber
-- ocurrido) NO puede ir en un CHECK (now() no es inmutable, Postgres lo rechaza):
-- va acá, en el mismo trigger BEFORE INSERT/UPDATE.
-- =============================================================================

create or replace function public.sales_fecha_cierre()
returns trigger language plpgsql set search_path = public as $$
declare v_fll timestamptz;
begin
  if new.booking_id is not null then
    select fecha_llamada into v_fll from public.bookings where id = new.booking_id;

    -- No se puede cerrar una venta contra una llamada que todavía no ocurrió.
    if v_fll is not null and v_fll > now() then
      raise exception 'no se puede cerrar una venta contra una llamada futura (fecha_llamada %)', v_fll;
    end if;
  end if;

  if new.fecha_cierre is null then
    new.fecha_cierre := coalesce(v_fll, new.created_at, now());
  elsif v_fll is not null and new.fecha_cierre < v_fll then
    raise exception 'fecha_cierre (%) anterior a la fecha de la llamada (%)', new.fecha_cierre, v_fll;
  end if;

  return new;
end;
$$;
