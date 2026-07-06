-- =============================================================================
-- Migración 0002 — Cascada de matcheo (a nivel DB, en la ingestión)
--
-- 1. lead ↔ booking : por ig_username normalizado (sin @, lowercase, trim)
-- 2. lead ↔ sale     : por email (sale.email_comprador == booking.email),
--                      la sale hereda el lead_id del booking. Match más frágil.
-- 3. booking ↔ call  : se resuelve en la Edge Function de Fathom (tiene el payload
--                      con event id / email del asistente) y setea calls.booking_id.
--
-- Resolver esto en triggers BEFORE lo hace robusto: matchea venga el dato de un
-- webhook o de una carga manual, y deja el flujo testeable con INSERTs de prueba.
-- Los no-matcheos se loguean con RAISE NOTICE, no se descartan.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- leads: normalizar ig_username en cada escritura (fuente de verdad del matcheo)
-- -----------------------------------------------------------------------------
create or replace function public.leads_normalize()
returns trigger
language plpgsql
as $$
begin
  new.ig_username := public.normalize_handle(new.ig_username);
  return new;
end;
$$;

create trigger trg_leads_normalize
  before insert or update on public.leads
  for each row execute function public.leads_normalize();

-- Cuando aparece / cambia de handle un lead, adoptar los bookings huérfanos que
-- ya habían llegado con ese mismo ig_username (el booking pudo entrar antes que
-- el webhook de ManyChat). Sólo toca bookings sin lead asignado.
create or replace function public.leads_backfill_bookings()
returns trigger
language plpgsql
as $$
begin
  if new.ig_username is not null then
    update public.bookings b
       set lead_id = new.id
     where b.lead_id is null
       and b.ig_username = new.ig_username;
  end if;
  return null;  -- AFTER trigger
end;
$$;

create trigger trg_leads_backfill_bookings
  after insert or update of ig_username on public.leads
  for each row execute function public.leads_backfill_bookings();

-- -----------------------------------------------------------------------------
-- bookings: normalizar handle/email y matchear al lead por ig_username
-- -----------------------------------------------------------------------------
create or replace function public.bookings_match()
returns trigger
language plpgsql
as $$
declare
  v_lead_id uuid;
begin
  new.ig_username := public.normalize_handle(new.ig_username);
  new.email       := public.normalize_email(new.email);

  -- Sólo intentar el matcheo automático si todavía no tiene lead asignado.
  if new.lead_id is null and new.ig_username is not null then
    select l.id
      into v_lead_id
      from public.leads l
     where l.ig_username = new.ig_username
     order by l.created_at desc
     limit 1;

    if found then
      new.lead_id := v_lead_id;
    else
      raise notice 'booking sin lead matcheado: ig_username=% calendly_event_id=%',
        new.ig_username, new.calendly_event_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_bookings_match
  before insert or update on public.bookings
  for each row execute function public.bookings_match();

-- -----------------------------------------------------------------------------
-- sales: normalizar email y matchear por email al booking (hereda lead_id)
-- -----------------------------------------------------------------------------
create or replace function public.sales_match()
returns trigger
language plpgsql
as $$
declare
  v_booking_id uuid;
  v_lead_id    uuid;
begin
  new.email_comprador := public.normalize_email(new.email_comprador);

  -- Auto-match por email sólo si no viene un booking asignado a mano.
  if new.booking_id is null and new.email_comprador is not null then
    select b.id, b.lead_id
      into v_booking_id, v_lead_id
      from public.bookings b
     where b.email = new.email_comprador
     order by b.fecha_llamada desc nulls last, b.created_at desc
     limit 1;

    if found then
      new.booking_id := v_booking_id;
      if new.lead_id is null then
        new.lead_id := v_lead_id;
      end if;
    end if;
  end if;

  -- matcheada refleja si la venta quedó asociada a un booking (el match por email).
  new.matcheada := (new.booking_id is not null);

  if not new.matcheada then
    raise notice 'sale sin matchear (queda para conciliación manual): email_comprador=% hotmart_transaction_id=%',
      new.email_comprador, new.hotmart_transaction_id;
  end if;

  return new;
end;
$$;

create trigger trg_sales_match
  before insert or update on public.sales
  for each row execute function public.sales_match();
