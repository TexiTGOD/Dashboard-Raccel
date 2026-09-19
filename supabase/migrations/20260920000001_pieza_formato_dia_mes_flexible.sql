-- Fix Atribución: piezas de septiembre caían como "Pieza inválida".
--
-- Causa: pieza_bucket() exigía día y mes de DOS dígitos ("Posteo - 14/09/2026").
-- El Origen que se carga a mano en ManyChat sale con "14/9/2026" (mes de 1
-- dígito), y a veces con una nota al final ("Posteo - 8/9/2026 No eleguida").
-- En prod: 79 de 80 leads inválidos de septiembre eran solo eso.
--
-- Cambios (todo por consulta, SIN migrar ni tocar un solo dato de leads):
--   1. pieza_nueva_canonica(): parsea el formato nuevo "Tipo - D/M/AAAA" con
--      día y mes de 1 o 2 dígitos, año de exactamente 4 dígitos y texto
--      opcional al final. Valida que la fecha exista (31/9 o 45/9 -> inválida).
--      Devuelve la clave canónica "Posteo - 08/09/2026" (dos dígitos, sin el
--      texto extra) o NULL si no se reconoce.
--   2. pieza_bucket(): usa pieza_nueva_canonica(). Misma firma y tipo de
--      retorno (create or replace). El formato viejo y welcome NO se tocan.
--      Todo valor que ya era válido devuelve EXACTAMENTE la misma clave que
--      antes: no se reagrupa nada del histórico.
--   3. dashboard_piezas_invalidas(): los valores CRUDOS que caen en "Pieza
--      inválida" con su cantidad de leads (mismo filtro que lead_agg de
--      dashboard_atribucion), para que un error de tipeo se vea al toque.
--
-- Espejo de web/src/lib/pieza.ts y de la Edge Function manychat-webhook: si
-- cambia un formato se tocan los tres (hay una tabla de casos que corre contra
-- los tres: web/scripts/test-pieza.mjs).
--
-- IDEMPOTENTE. Sin DROP (las firmas y formas de retorno no cambian).
-- ORDEN DE DEPLOY: SQL primero, merge después (el frontend llama a
-- dashboard_piezas_invalidas).

begin;

create or replace function public.pieza_nueva_canonica(pieza text)
returns text
language sql immutable set search_path = public as $$
  with m as (
    -- btrim con lista de caracteres: además del espacio, tab, saltos de línea
    -- y el espacio no separable (NBSP) que aparece al pegar desde otras apps.
    select regexp_match(
             btrim(pieza, E' \t\r\n\u00a0'),
             '^(reel|posteo|historia)[[:space:]]*-[[:space:]]*([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})([^0-9].*)?$',
             'i'
           ) as g
  )
  select case
    when g is null                                   then null
    when g[3]::int not between 1 and 12              then null   -- mes
    when g[4]::int not between 2000 and 2100         then null   -- año (evita make_date con años absurdos)
    when g[2]::int not between 1 and extract(day from
           (make_date(g[4]::int, g[3]::int, 1) + interval '1 month' - interval '1 day'))::int
                                                     then null   -- día que no existe en ese mes
    else initcap(g[1]) || ' - ' || lpad(g[2], 2, '0') || '/' || lpad(g[3], 2, '0') || '/' || g[4]
  end
  from m
$$;

comment on function public.pieza_nueva_canonica(text) is
  'Formato nuevo de pieza_origen ("Tipo - D/M/AAAA" + texto opcional) -> clave canónica "Tipo - DD/MM/AAAA", o NULL si no se reconoce o la fecha no existe.';

create or replace function public.pieza_bucket(pieza text)
returns text
language sql immutable set search_path = public as $$
  select case
    -- Formato VIEJO: REEL_DDMM / CARR_DDMM / HIST_DDMM. Se devuelve tal cual.
    when pieza ~ '^(REEL|CARR|HIST)_[0-9]{4}$' then pieza

    -- Formato NUEVO, canonizado solo para AGRUPAR (el texto lindo lo arma
    -- web/src/lib/pieza.ts).
    when public.pieza_nueva_canonica(pieza) is not null then public.pieza_nueva_canonica(pieza)

    -- Seguimientos. Case-insensitive, colapsado al canónico 'welcome'.
    when lower(trim(pieza)) = 'welcome' then 'welcome'

    when pieza is null or trim(pieza) = '' then 'Sin atribuir'
    else                                        'Pieza inválida'
  end
$$;

-- Valores crudos que caen en "Pieza inválida", con sus leads. Mismo filtro que
-- lead_agg de dashboard_atribucion (sin crisis, fecha_primer_contacto en el
-- período), así la suma de esta lista == los leads de la card "Pieza inválida".
create or replace function public.dashboard_piezas_invalidas(p_start date, p_end date)
returns table (valor_crudo text, leads bigint)
language sql stable security invoker set search_path = public as $$
  select l.pieza_origen, count(*)
  from public.leads l
  where l.crisis = false
    and l.fecha_primer_contacto >= p_start and l.fecha_primer_contacto < p_end
    and public.pieza_bucket(l.pieza_origen) = 'Pieza inválida'
  group by l.pieza_origen
  order by 2 desc, 1
$$;

grant execute on function public.pieza_nueva_canonica(text)               to authenticated, service_role;
grant execute on function public.pieza_bucket(text)                        to authenticated, service_role;
grant execute on function public.dashboard_piezas_invalidas(date, date)    to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
