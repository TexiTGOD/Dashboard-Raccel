-- =============================================================================
-- Migración 0018 — Pipeline de llamadas: archivar lo TERMINADO
--
-- Regla nueva: "lo terminado se archiva, lo accionable queda visible".
-- Una llamada atendida cuyo resultado ya es vendido o perdido está cerrada: sale
-- de la columna Atendida y pasa al archivado (junto a no-show y canceladas).
-- En Atendida quedan solo las que todavía piden algo:
--   - seguimiento (follow_up)
--   - atendida sin resultado cargado (pendiente o sin call)
--
-- NO se tocan los nombres de estados: bookings.estado y calls.resultado quedan
-- igual. Lo que cambia es la CLASE del pipeline (agrupación de presentación).
--
-- Además, la clasificación se extrae a UNA función (pipeline_clase_llamada) que
-- usan tanto las filas como los conteos. Antes el CASE estaba duplicado en las
-- dos funciones y podían driftear: con una sola definición, el conteo de cada
-- columna y las tarjetas que muestra no pueden discrepar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- La definición ÚNICA de la clase de una llamada.
-- stable (no immutable) porque compara contra now().
-- resultado NULL o 'pendiente' => sigue siendo accionable => 'atendida'.
-- -----------------------------------------------------------------------------
create or replace function public.pipeline_clase_llamada(
  p_estado    text,
  p_fecha     timestamptz,
  p_resultado text
)
returns text
language sql stable set search_path = public as $$
  select case
    when p_estado in ('cancelada','reprogramada')          then 'cancelada'
    when p_estado = 'no_show'                              then 'no_show'
    -- atendida + desenlace cerrado -> archivado
    when p_estado = 'atendida' and p_resultado = 'vendido' then 'vendido'
    when p_estado = 'atendida' and p_resultado = 'perdido' then 'perdido'
    -- atendida accionable: follow_up, 'pendiente' o sin call cargada
    when p_estado = 'atendida'                             then 'atendida'
    when p_fecha >= now()                                  then 'programada'
    else                                                        'pendiente'
  end
$$;

-- -----------------------------------------------------------------------------
-- Filas del pipeline. El resultado se resuelve una sola vez (lateral) y alimenta
-- tanto la columna `resultado` como la clase.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_pipeline_llamadas(p_start date, p_end date)
returns table (
  booking_id  uuid,
  fecha       timestamptz,
  lead_nombre text,
  ig          text,
  closer      text,
  estado      text,
  resultado   text,
  pieza       text,
  clase       text
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select b.id                                        as b_id,
           b.fecha_llamada                             as b_fecha,
           coalesce(l.nombre, b.nombre)                as b_nombre,
           coalesce(l.ig_username, b.ig_username)      as b_ig,
           b.closer                                    as b_closer,
           b.estado                                    as b_estado,
           r.resultado                                 as b_resultado,
           l.pieza_origen                              as b_pieza,
           public.pipeline_clase_llamada(b.estado, b.fecha_llamada, r.resultado) as b_clase
    from public.bookings b
    left join public.leads l on l.id = b.lead_id
    left join lateral (
      select c.resultado
      from public.calls c
      where c.booking_id = b.id
      order by c.created_at desc
      limit 1
    ) r on true
    where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
  )
  select b_id, b_fecha, b_nombre, b_ig, b_closer, b_estado, b_resultado, b_pieza, b_clase
  from base
  -- Cada columna se lee natural: las programadas por cercanía (la próxima
  -- primero); el resto, lo más reciente primero. El id desempata para que el
  -- orden sea TOTAL (paginable con range sin duplicar ni saltear).
  order by
    case when b_clase = 'programada' then 0 else 1 end,
    case when b_clase = 'programada' then b_fecha end asc,
    b_fecha desc,
    b_id desc
$$;

-- -----------------------------------------------------------------------------
-- Conteos por columna. Misma clasificación (misma función) y mismos filtros que
-- las filas => el número de cada columna == las tarjetas que muestra.
-- Cambia la firma (se agregan vendido/perdido): hay que dropear antes.
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_pipeline_llamadas_counts(date, date);
create function public.dashboard_pipeline_llamadas_counts(p_start date, p_end date)
returns table (
  programada bigint,
  pendiente  bigint,
  atendida   bigint,
  vendido    bigint,
  perdido    bigint,
  no_show    bigint,
  cancelada  bigint,
  total      bigint
)
language sql stable security invoker set search_path = public as $$
  with clasificadas as (
    select public.pipeline_clase_llamada(
             b.estado,
             b.fecha_llamada,
             (select c.resultado from public.calls c
               where c.booking_id = b.id order by c.created_at desc limit 1)
           ) as clase
    from public.bookings b
    where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
  )
  select
    count(*) filter (where clase = 'programada'),
    count(*) filter (where clase = 'pendiente'),
    count(*) filter (where clase = 'atendida'),
    count(*) filter (where clase = 'vendido'),
    count(*) filter (where clase = 'perdido'),
    count(*) filter (where clase = 'no_show'),
    count(*) filter (where clase = 'cancelada'),
    count(*)
  from clasificadas
$$;

grant execute on function public.pipeline_clase_llamada(text, timestamptz, text)  to authenticated, service_role;
grant execute on function public.dashboard_pipeline_llamadas(date, date)          to authenticated, service_role;
grant execute on function public.dashboard_pipeline_llamadas_counts(date, date)   to authenticated, service_role;
