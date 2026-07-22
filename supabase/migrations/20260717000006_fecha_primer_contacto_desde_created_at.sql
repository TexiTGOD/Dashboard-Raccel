-- =============================================================================
-- Migración 0020 — fecha_primer_contacto derivada de created_at (fix webhook)
--
-- Bug del webhook de ManyChat: recibía fecha_primer_contacto en el body.
--   · Cuando llegaba el placeholder crudo ({{cuf_...}}) o vacío, Postgres rechazaba
--     el cast a timestamptz → 500 → el lead ENTERO se perdía.
--   · Cuando llegaba, venía sin hora (todo a las 00:00) → dato de hora basura.
--   · Hay 2 External Requests por lead (1º INSERT, 2º UPDATE); el 2º pisaba la
--     fecha del 1º.
--
-- Fix (2 piezas). Esta es la de DB: "primer contacto" = momento del INSERT.
-- Un trigger BEFORE INSERT completa fecha_primer_contacto desde created_at (que ya
-- tiene default now(), es inmutable y nunca rompe). La otra pieza (Edge Function)
-- deja de mandar el campo, así el UPDATE nunca lo toca → correcto por construcción.
--
-- Aditiva: agrega función + trigger + backfill. No cambia schema ni funciones
-- existentes. El ancla de período de todo el dashboard (fecha_primer_contacto)
-- se mantiene: solo cambia de dónde se llena.
-- =============================================================================

create or replace function public.leads_fecha_primer_contacto()
returns trigger language plpgsql set search_path = public as $$
begin
  -- coalesce: si un caller manda un valor explícito (ej. el seed a escala, con
  -- fechas históricas a propósito), se respeta. Si no viene (el webhook ya no lo
  -- manda), se deriva de created_at = el momento real del INSERT, con hora exacta.
  new.fecha_primer_contacto := coalesce(new.fecha_primer_contacto, new.created_at, now());
  return new;
end;
$$;

-- BEFORE INSERT solo: el UPDATE (2º request) no dispara este trigger, así que
-- nunca pisa la fecha. Convive sin choque con trg_leads_normalize (campos distintos).
create trigger trg_leads_fecha_primer_contacto
  before insert on public.leads
  for each row execute function public.leads_fecha_primer_contacto();

-- -----------------------------------------------------------------------------
-- Backfill: rescatar leads que entraron con fecha_primer_contacto null (hoy
-- invisibles en el embudo porque el filtro de rango los excluye). Su created_at
-- es el primer contacto real. Aditivo y seguro (solo toca filas con null).
-- -----------------------------------------------------------------------------
update public.leads
   set fecha_primer_contacto = created_at
 where fecha_primer_contacto is null;
