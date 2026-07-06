-- =============================================================================
-- Test del criterio de éxito de la fase (matcheo de punta a punta).
--
-- Simula el flujo real insertando directo en las tablas (lo mismo que hacen las
-- Edge Functions después de mapear los payloads). Corre dentro de una transacción
-- que hace ROLLBACK al final: es repetible y no ensucia datos.
--
-- Correr contra la DB local:
--   supabase db reset                # aplica migraciones
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/flow_test.sql
--
-- Cualquier assert que falle corta con ON_ERROR_STOP y muestra el FALLO.
-- =============================================================================

begin;

-- 1) Lead entra por ManyChat. Handle escrito "sucio" a propósito: "@Maria.Lopez "
insert into public.leads (manychat_contact_id, ig_username, nombre, pieza_origen, conciencia, estado_funnel)
values ('mc_test_001', '@Maria.Lopez ', 'Maria', 'REEL_3004', 4, 'lead_calificado');

-- 2) Booking de Calendly con el MISMO handle en otro formato ("maria.lopez").
insert into public.bookings (calendly_event_id, ig_username, email, nombre, closer, estado)
values ('cal_test_001', 'maria.lopez', 'Maria@Gmail.com', 'Maria', 'Tatiana', 'programada');

do $$
declare v_lead uuid;
begin
  select lead_id into v_lead from public.bookings where calendly_event_id = 'cal_test_001';
  if v_lead is null then
    raise exception 'FALLO 1: el booking no matcheó al lead por ig_username';
  end if;
  raise notice 'OK 1: booking linkeado al lead % (matcheo por handle normalizado)', v_lead;
end $$;

-- 3) Sale de Hotmart con el MISMO email (otro casing) -> debe quedar matcheada.
insert into public.sales (hotmart_transaction_id, email_comprador, nombre_comprador, monto, moneda, status)
values ('htx_test_001', 'MARIA@gmail.com', 'Maria Lopez', 1497, 'USD', 'approved');

do $$
declare r record;
begin
  select matcheada, lead_id, booking_id into r
  from public.sales where hotmart_transaction_id = 'htx_test_001';
  if not r.matcheada then
    raise exception 'FALLO 2: la sale con email coincidente debería estar matcheada';
  end if;
  if r.lead_id is null then
    raise exception 'FALLO 2b: la sale no heredó el lead_id del booking';
  end if;
  raise notice 'OK 2: sale matcheada -> lead=% booking=%', r.lead_id, r.booking_id;
end $$;

-- 4) Sale con email DISTINTO -> matcheada = false (conciliación manual).
insert into public.sales (hotmart_transaction_id, email_comprador, nombre_comprador, monto, moneda, status)
values ('htx_test_002', 'otro.comprador@gmail.com', 'Otro Comprador', 1497, 'USD', 'approved');

do $$
declare r record;
begin
  select matcheada, lead_id into r
  from public.sales where hotmart_transaction_id = 'htx_test_002';
  if r.matcheada then
    raise exception 'FALLO 3: la sale con email distinto NO debería estar matcheada';
  end if;
  raise notice 'OK 3: sale sin match (queda para conciliación manual) matcheada=%', r.matcheada;
end $$;

-- 5) Bonus: un call de Fathom asociado al booking por calendly_event_id.
insert into public.calls (booking_id, resumen_fathom, resultado, fecha)
select id, 'Resumen de prueba de la llamada.', 'vendido', now()
from public.bookings where calendly_event_id = 'cal_test_001';

-- Vista final: la cadena completa lead -> booking -> call -> sale.
select
  l.nombre               as lead,
  l.pieza_origen         as atribucion,
  b.calendly_event_id    as booking,
  b.closer,
  c.resultado            as resultado_call,
  s.hotmart_transaction_id as venta,
  s.monto,
  s.matcheada
from public.leads l
left join public.bookings b on b.lead_id = l.id
left join public.calls    c on c.booking_id = b.id
left join public.sales    s on s.booking_id = b.id
where l.manychat_contact_id = 'mc_test_001';

do $$ begin raise notice '=== TODOS LOS ASSERTS PASARON ==='; end $$;

rollback;
