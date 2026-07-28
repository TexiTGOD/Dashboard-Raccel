-- =============================================================================
-- Migración 0024 — calificado manual en el booking (criterio del closer)
--
-- El closer marca a mano si la llamada estaba calificada. Es INDEPENDIENTE de lo
-- que digan las respuestas del formulario de Calendly (recursos declarados) y de
-- leads.econ_calificacion (que viene de la ingestión): es su criterio después de
-- hablar con la persona.
--
-- nullable a propósito: null = todavía no lo marcó (distinto de "no calificada").
--
-- Aditiva: solo agrega una columna. La edición usa la auditoría existente —
-- updated_by (migración 0013) + updated_at por trigger.
-- =============================================================================

alter table public.bookings add column if not exists calificado boolean;

comment on column public.bookings.calificado is
  'Criterio del closer sobre si la llamada estaba calificada. null = sin marcar. Independiente de leads.econ_calificacion y de las respuestas de Calendly.';
