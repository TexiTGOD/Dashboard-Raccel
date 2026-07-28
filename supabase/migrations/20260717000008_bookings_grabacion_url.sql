-- =============================================================================
-- Migración 0022 — grabacion_url manual en bookings (provisorio pre-Fathom)
--
-- Todavía no hay integración con Fathom. Mientras tanto, el closer pega a mano el
-- link de la grabación (Zoom/Meet/Drive/etc.) en el expediente de la llamada.
--
-- Aditiva: solo agrega una columna nullable. La edición usa la misma auditoría que
-- el resto de los campos editables — updated_by ya existe en bookings (migración
-- 0013) y updated_at lo setea el trigger trg_bookings_updated_at.
-- =============================================================================

alter table public.bookings add column if not exists grabacion_url text;

comment on column public.bookings.grabacion_url is
  'Link manual de la grabación (Zoom/Meet/Drive/etc.), cargado por el closer en el expediente. Provisorio hasta la integración con Fathom.';
