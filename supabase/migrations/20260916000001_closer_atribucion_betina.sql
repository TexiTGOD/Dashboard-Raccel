-- Tanda: atribución de closer Linda→Betina + closer editable a mano.
--
-- Contexto: las llamadas se siguen agendando en el Calendly de Linda
-- (es su cuenta), asi que el webhook siempre trae su mail como host,
-- aunque quien atienda sea Betina. Esta migración instala una regla dura:
-- desde la fecha de corte, los bookings con host=Linda se reatribuyen a
-- Betina. El histórico anterior al corte queda intacto siempre.

-- ============================================================
-- Constantes centralizadas. Para cambiar el corte o los mails
-- (ej. al pasar a prod con el mail real de Betina), tocar SOLO acá.
-- ============================================================

create or replace function public.closer_fecha_corte_betina()
returns date
language sql
immutable
as $$ select date '2026-09-21' $$;

comment on function public.closer_fecha_corte_betina() is
  'Fecha desde la cual los bookings con host=Linda se atribuyen a Betina. Único lugar para cambiar el corte.';

create or replace function public.closer_identifier_linda()
returns text
language sql
immutable
as $$ select 'lindameneghelli@hotmail.com' $$;

create or replace function public.closer_identifier_betina()
returns text
language sql
immutable
as $$ select 'mariabetinabeinatborde@gmail.com' $$;

comment on function public.closer_identifier_betina() is
  'Identificador de Betina (debe igualar profiles.closer_identifier de su usuario). Único lugar para cambiarlo.';

-- ============================================================
-- Flags de override manual: una edición a mano del closer
-- le gana siempre a la regla automática, para siempre.
-- ============================================================

alter table public.bookings add column if not exists closer_manual boolean not null default false;
comment on column public.bookings.closer_manual is
  'true si el closer fue corregido a mano en Registros — la regla automática Linda→Betina no lo pisa.';

alter table public.sales add column if not exists closer_manual boolean not null default false;
comment on column public.sales.closer_manual is
  'true si el closer fue corregido a mano en Registros — no hereda del booking asociado.';

-- ============================================================
-- Trigger bookings: aplica la regla dura en insert/update.
-- Autoprotegido para histórico: solo actúa si fecha_llamada >= corte,
-- así que una fila vieja nunca se ve afectada la toquen o no.
-- ============================================================

create or replace function public.closer_atribucion_bookings()
returns trigger
language plpgsql
as $$
begin
  if not new.closer_manual
     and new.closer = public.closer_identifier_linda()
     and new.fecha_llamada >= public.closer_fecha_corte_betina() then
    new.closer := public.closer_identifier_betina();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_closer_atribucion_bookings on public.bookings;
create trigger trg_closer_atribucion_bookings
before insert or update on public.bookings
for each row execute function public.closer_atribucion_bookings();

-- ============================================================
-- Trigger sales: hereda closer del booking asociado, SOLO en insert.
-- Nunca en update -- así editar una venta vieja por otro motivo
-- (ej. corregir un monto) jamás toca su closer histórico.
-- ============================================================

create or replace function public.closer_atribucion_sales()
returns trigger
language plpgsql
as $$
declare
  v_booking_closer text;
begin
  if not new.closer_manual and new.booking_id is not null then
    select closer into v_booking_closer from public.bookings where id = new.booking_id;
    if v_booking_closer is not null then
      new.closer := v_booking_closer;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_closer_atribucion_sales on public.sales;
create trigger trg_closer_atribucion_sales
before insert on public.sales
for each row execute function public.closer_atribucion_sales();
