-- Tanda: carga de desenlace extendido de la llamada (producto ofrecido, precio,
-- dolor principal, objeciones, próximo seguimiento) — todo en un solo lugar
-- (panel "Desenlace" de /closer/[id]) para que la closer lo cargue rápido y de
-- una sola vez después de cada llamada.
--
-- Todo va en `calls` (la tabla del desenlace de la llamada), NO en bookings ni
-- en leads:
--   - bookings.calificado, calls.resultado y calls.notas_closer YA EXISTEN y
--     hacen exactamente lo pedido — se reusan tal cual, sin duplicar.
--   - leads.dolor es el sistema VIEJO (pre calificación de 3 dimensiones), vive
--     en el LEAD no en la llamada, y su enum no matchea las 3 opciones nuevas.
--     dolor_principal es un concepto distinto (criterio de la closer post-
--     llamada) y va aparte, sin tocar leads.dolor.
--
-- Ningún RPC existente se ve afectado: todos seleccionan columnas explícitas
-- de `calls`, ninguno hace `select *`.
--
-- RLS: sin cambios. calls_closer_update/_insert + calls_admin_all (auth_roles_rls.sql)
-- ya cubren exactamente "closer sobre sus propios bookings, admin todo".

alter table public.calls
  add column if not exists producto_ofrecido   text,
  add column if not exists precio_ofrecido      numeric,
  add column if not exists dolor_principal      text,
  add column if not exists dolor_extra          text,
  add column if not exists objeciones           text[],
  add column if not exists objeciones_extra     text,
  add column if not exists proximo_seguimiento  date;

-- Selector único de producto: mismas 2 opciones que sales.producto usa como
-- texto libre para el producto YA vendido — acá es lo que se OFRECIÓ, pase o
-- no la venta, por eso es una columna aparte en calls.
alter table public.calls add constraint calls_producto_ofrecido_valido check (
  producto_ofrecido is null or producto_ofrecido in (
    'Volver a Sentir-Me',
    'Volver a Sentir-Me | Autoguiado'
  )
);

-- Dolor principal SEGÚN LA CLOSER después de hablar con el lead. Slugs propios,
-- sin relación con leads.dolor (sistema viejo) ni con la calificación de 3
-- dimensiones de ManyChat — son cosas distintas a propósito.
alter table public.calls add constraint calls_dolor_principal_valido check (
  dolor_principal is null or dolor_principal in (
    'intimidad_sin_eleccion',
    'comparacion_otra',
    'darlo_todo_no_elegida'
  )
);

-- Objeciones: selector múltiple -> array. <@ valida que CADA elemento cargado
-- esté en la lista fija (subset), sin bloquear null/array vacío.
alter table public.calls add constraint calls_objeciones_validas check (
  objeciones is null or objeciones <@ array[
    'plata',
    'hablar_pareja',
    'no_es_momento',
    'lo_voy_a_pensar',
    'no_tengo_tiempo'
  ]::text[]
);

-- Sin fecha fantasma: si el resultado no es follow_up, proximo_seguimiento NO
-- puede tener valor. Se aplica también en el server action (defensa en
-- profundidad), pero la garantía real está acá: no depende de que ningún
-- código nuevo se acuerde de limpiarla.
alter table public.calls add constraint calls_seguimiento_solo_follow_up check (
  proximo_seguimiento is null or resultado = 'follow_up'
);

comment on column public.calls.producto_ofrecido is
  'Producto ofrecido en la llamada (selector fijo, lib/desenlace.ts). Independiente de si se vendió.';
comment on column public.calls.precio_ofrecido is
  'Precio real ofrecido/negociado en la llamada (puede diferir del precio de lista por cuotas/descuentos). Para AOV.';
comment on column public.calls.dolor_principal is
  'Dolor principal según criterio de la closer post-llamada (selector fijo). Distinto de leads.dolor (sistema viejo) y de la calificación de 3 dimensiones de ManyChat.';
comment on column public.calls.dolor_extra is
  'Dolor libre cuando no entra en las 3 opciones fijas de dolor_principal.';
comment on column public.calls.objeciones is
  'Objeciones de la llamada (selector múltiple fijo, lib/desenlace.ts).';
comment on column public.calls.objeciones_extra is
  'Objeciones libres cuando no entran en las 5 opciones fijas.';
comment on column public.calls.proximo_seguimiento is
  'Fecha del próximo seguimiento. Solo tiene sentido (y solo se permite) con resultado=follow_up — ver constraint calls_seguimiento_solo_follow_up.';
