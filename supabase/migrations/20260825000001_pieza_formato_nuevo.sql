-- =============================================================================
-- Migración 0027 — pieza_origen: reconocer el formato NUEVO además del viejo
--
-- Las automatizaciones nuevas de ManyChat mandan pieza_origen en un formato más
-- legible: "<Tipo> - dd/mm/aaaa"  (Reel / Posteo / Historia).
-- El formato viejo (REEL_DDMM, CARR_DDMM, HIST_DDMM, welcome) sigue existiendo en
-- cientos de leads y NO se toca: esta migración es puramente aditiva, no modifica
-- ni migra un solo dato.
--
-- pieza_bucket solo CLASIFICA (válida / Sin atribuir / Pieza inválida) y devuelve
-- el valor crudo cuando es válida. El mapeo a texto legible ("Posteo del 04/02")
-- vive en el frontend (web/src/lib/pieza.ts), en un único lugar, para no duplicar
-- las etiquetas en dos lenguajes.
--
-- Espejo del parser TS: si cambia un formato, se tocan los dos (mismo criterio que
-- normalize_handle / normalizeHandle).
--
-- La canonización aplica SOLO al formato nuevo. El viejo se devuelve tal cual, sin
-- tocar: cualquier normalización ahí cambiaría cómo se agrupan cientos de leads
-- históricos, que es justo lo que esta tanda no debe hacer.
-- =============================================================================

create or replace function public.pieza_bucket(pieza text)
returns text
language sql immutable set search_path = public as $$
  select case
    -- Formato VIEJO: REEL_DDMM / CARR_DDMM / HIST_DDMM. Se devuelve tal cual.
    when pieza ~ '^(REEL|CARR|HIST)_[0-9]{4}$' then pieza

    -- Formato NUEVO: "<Tipo> - dd/mm/aaaa". Case-insensitive y tolerante con los
    -- espacios alrededor del guion.
    --
    -- Se devuelve CANONIZADO ("Reel - 04/08/2026"): mayúscula inicial del tipo y un
    -- solo espacio a cada lado del guion. Es solo para AGRUPAR — así una variación
    -- de tipeo ("reel - 04/08/2026", "Reel-04/08/2026") no abre dos cards de la
    -- misma pieza en Atribución. NO es display: el texto lindo ("Reel del 04/08")
    -- lo arma web/src/lib/pieza.ts, que lee cualquiera de las variantes igual.
    when trim(pieza) ~* '^(reel|posteo|historia)[[:space:]]*-[[:space:]]*[0-9]{2}/[0-9]{2}/[0-9]{4}$'
      then initcap(regexp_replace(trim(pieza), '[[:space:]]*-[[:space:]]*', ' - '))

    -- Seguimientos. Case-insensitive (igual que en el front) y colapsado al
    -- canónico 'welcome', para que las variantes no abran cards distintas.
    when lower(trim(pieza)) = 'welcome' then 'welcome'

    when pieza is null or trim(pieza) = '' then 'Sin atribuir'
    else                                        'Pieza inválida'
  end
$$;
