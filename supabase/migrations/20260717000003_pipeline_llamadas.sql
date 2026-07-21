-- =============================================================================
-- Migración 0017 — Tanda 3 (#2): pipeline de llamadas
--
-- Vista de llamadas en columnas por estado + archivado. Aditiva: solo agrega dos
-- funciones de lectura, no toca schema ni funciones existentes.
--
-- La CLASE del pipeline es un REFINAMIENTO de la `clase` que ya usa
-- dashboard_kpis (una definición por métrica, no se inventa otra):
--
--   pipeline            dashboard_kpis
--   ------------------  --------------------
--   programada       →  'futura'              (estado programada, fecha por venir)
--   pendiente        →  'pendiente_desenlace' (fecha ya pasó, sin desenlace cargado)
--   atendida     ┐
--   no_show      ┘   →  'resuelta'
--   cancelada        →  'cancelada'           (incluye reprogramada, igual que kpis)
--
-- Es decir: pipeline.pendiente == dashboard_kpis.pendientes, y
-- pipeline.atendida + pipeline.no_show == dashboard_kpis.resueltas, para el mismo
-- rango. "Sin desenlace cargado" = el booking sigue en 'programada' (el desenlace
-- se materializa como estado atendida/no_show).
--
-- Mismos anclajes que el resto: período por fecha_llamada, exclusión de leads en
-- crisis, rango [p_start, p_end). security invoker → RLS del que llama (admin ve
-- todo; closer solo sus llamadas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Filas del pipeline (una por llamada) con su clase ya calculada en la base.
-- El front solo agrupa por `clase` y formatea — no decide la clase.
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
  select b.id, b.fecha_llamada,
         coalesce(l.nombre, b.nombre), coalesce(l.ig_username, b.ig_username),
         b.closer, b.estado,
         (select c.resultado from public.calls c where c.booking_id = b.id order by c.created_at desc limit 1),
         l.pieza_origen,
         case
           when b.estado in ('cancelada','reprogramada') then 'cancelada'
           when b.estado = 'no_show'                     then 'no_show'
           when b.estado = 'atendida'                    then 'atendida'
           when b.fecha_llamada >= now()                 then 'programada'
           else                                               'pendiente'
         end
  from public.bookings b
  left join public.leads l on l.id = b.lead_id
  where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
    and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
  -- Orden pensado para que cada columna se lea natural: las programadas por
  -- cercanía (la próxima primero); el resto, lo más reciente primero. El id
  -- desempata para que el orden sea TOTAL (paginable con range sin duplicar).
  order by
    case when b.estado not in ('cancelada','reprogramada','no_show','atendida')
              and b.fecha_llamada >= now() then 0 else 1 end,
    case when b.estado not in ('cancelada','reprogramada','no_show','atendida')
              and b.fecha_llamada >= now() then b.fecha_llamada end asc,
    b.fecha_llamada desc,
    b.id desc
$$;

-- -----------------------------------------------------------------------------
-- Conteos por columna (agregados en la base: sin el cap de 1000 filas de
-- PostgREST). Son la fuente de verdad de los números que muestra cada columna.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_pipeline_llamadas_counts(p_start date, p_end date)
returns table (
  programada bigint,
  pendiente  bigint,
  atendida   bigint,
  no_show    bigint,
  cancelada  bigint,
  total      bigint
)
language sql stable security invoker set search_path = public as $$
  with clasificadas as (
    select case
             when b.estado in ('cancelada','reprogramada') then 'cancelada'
             when b.estado = 'no_show'                     then 'no_show'
             when b.estado = 'atendida'                    then 'atendida'
             when b.fecha_llamada >= now()                 then 'programada'
             else                                               'pendiente'
           end as clase
    from public.bookings b
    where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
  )
  select
    count(*) filter (where clase = 'programada'),
    count(*) filter (where clase = 'pendiente'),
    count(*) filter (where clase = 'atendida'),
    count(*) filter (where clase = 'no_show'),
    count(*) filter (where clase = 'cancelada'),
    count(*)
  from clasificadas
$$;

grant execute on function public.dashboard_pipeline_llamadas(date, date)        to authenticated, service_role;
grant execute on function public.dashboard_pipeline_llamadas_counts(date, date) to authenticated, service_role;
