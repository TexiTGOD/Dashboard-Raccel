-- =============================================================================
-- Migración 0021 — 'welcome' como origen válido en Atribución
--
-- Los leads con pieza_origen = 'welcome' (seguidores nuevos que entran por el
-- flujo de bienvenida, sin pieza de contenido puntual) caían en la card
-- 'Pieza inválida' porque la validación solo aceptaba ^(REEL|CARR|HIST)_DDMM.
-- welcome es un origen legítimo → debe aparecer como una card más en la grilla.
--
-- Se extrae la clasificación de pieza a UNA función (pieza_bucket), igual patrón
-- que pipeline_clase_llamada: una sola definición que usan las 4 agregaciones de
-- dashboard_atribucion, así el conteo de cada bucket y las cards no pueden driftear.
--
-- Aditiva: agrega pieza_bucket y hace create-or-replace de dashboard_atribucion
-- (misma firma). No cambia schema. create or replace conserva los grants.
-- =============================================================================

-- Clasificación única de pieza_origen -> bucket de Atribución.
-- 'welcome' se compara con lower(trim(...)) para contemplar casing/espacios, y se
-- devuelve el canónico 'welcome' para que todas las variantes colapsen en una card.
create or replace function public.pieza_bucket(pieza text)
returns text
language sql immutable set search_path = public as $$
  select case
    when pieza ~ '^(REEL|CARR|HIST)_[0-9]{4}$' then pieza
    when lower(trim(pieza)) = 'welcome'         then 'welcome'
    when pieza is null or pieza = ''            then 'Sin atribuir'
    else                                             'Pieza inválida'
  end
$$;

grant execute on function public.pieza_bucket(text) to authenticated, service_role;

-- dashboard_atribucion: mismo cuerpo que la 0008 (tanda1_fixes), con los 4 CASE
-- reemplazados por public.pieza_bucket(l.pieza_origen). Nada más cambia.
create or replace function public.dashboard_atribucion(p_start date, p_end date)
returns table (
  pieza_origen   text,
  leads          bigint,
  calificados    bigint,
  agendas        bigint,
  atendidas      bigint,
  ventas         bigint,
  facturacion    numeric,
  cash_collected numeric,
  cash_por_lead  numeric
)
language sql stable security invoker set search_path = public as $$
  with
  lead_agg as (
    select
      public.pieza_bucket(l.pieza_origen) as bucket,
      count(*) as leads,
      count(*) filter (where l.econ_calificacion = 'calificada') as calificados
    from public.leads l
    where l.crisis = false and l.fecha_primer_contacto >= p_start and l.fecha_primer_contacto < p_end
    group by 1
  ),
  book_agg as (
    select
      public.pieza_bucket(l.pieza_origen) as bucket,
      count(*) as agendas,
      count(*) filter (where b.estado = 'atendida') as atendidas
    from public.bookings b
    left join public.leads l on l.id = b.lead_id
    where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
      and b.estado not in ('cancelada','reprogramada')
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
    group by 1
  ),
  sale_agg as (
    select
      public.pieza_bucket(l.pieza_origen) as bucket,
      count(*) as ventas,
      coalesce(sum(s.valor_contrato), 0) as facturacion
    from public.sales s
    left join public.leads l on l.id = s.lead_id
    where not exists (select 1 from public.leads ld where ld.id = s.lead_id and ld.crisis)
      and s.fecha_cierre >= p_start and s.fecha_cierre < p_end
    group by 1
  ),
  cash_agg as (
    select
      public.pieza_bucket(l.pieza_origen) as bucket,
      coalesce(sum(p.monto), 0) as cash_collected
    from public.payments p
    join public.sales s on s.id = p.sale_id
    left join public.leads l on l.id = s.lead_id
    where not exists (select 1 from public.leads ld where ld.id = s.lead_id and ld.crisis)
      and p.fecha >= p_start and p.fecha < p_end
    group by 1
  ),
  buckets as (
    select bucket from lead_agg union select bucket from book_agg
    union select bucket from sale_agg union select bucket from cash_agg
  )
  select
    bk.bucket,
    coalesce(la.leads,0), coalesce(la.calificados,0),
    coalesce(ba.agendas,0), coalesce(ba.atendidas,0),
    coalesce(sa.ventas,0), coalesce(sa.facturacion,0),
    coalesce(ca.cash_collected,0),
    coalesce(ca.cash_collected,0) / nullif(coalesce(la.leads,0), 0)
  from buckets bk
  left join lead_agg la on la.bucket = bk.bucket
  left join book_agg ba on ba.bucket = bk.bucket
  left join sale_agg sa on sa.bucket = bk.bucket
  left join cash_agg ca on ca.bucket = bk.bucket
  order by 8 desc nulls last
$$;
