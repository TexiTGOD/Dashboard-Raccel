-- =============================================================================
-- Migración 0023 — persistir las respuestas del formulario de Calendly
--
-- El webhook de Calendly recibe questions_and_answers (las respuestas del
-- formulario del prospecto al agendar) pero hoy solo extrae el IG y descarta el
-- resto. Esta columna guarda el array completo tal como llega del payload.
--
-- Aditiva: solo agrega una columna jsonb nullable. Misma forma de guardar que
-- bookings_descartados.payload (el objeto crudo del payload en una columna jsonb).
-- Esta tanda es SOLO persistir; la presentación en el frontend va aparte.
--
-- IMPORTANTE de orden: aplicar ESTA migración ANTES de desplegar el webhook nuevo.
-- El webhook nuevo escribe calendly_respuestas en el upsert; si la columna no
-- existe todavía, el insert falla (500) y el booking se pierde.
-- =============================================================================

alter table public.bookings add column if not exists calendly_respuestas jsonb;

comment on column public.bookings.calendly_respuestas is
  'Respuestas del formulario de Calendly (questions_and_answers completo) tal como llega del payload. Se persiste; la presentación es una tanda aparte.';
