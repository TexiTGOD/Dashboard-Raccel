-- =============================================================================
-- Migración 0007 — Tanda 1: datos y lógica (números verdaderos)
--
-- Reglas nuevas (todas viven acá, una definición por métrica):
--  1.0 Clasificar cada booking: futura / pendiente_desenlace / resuelta /
--      cancelada. Solo las resueltas entran en ratios. Las futuras NUNCA.
--  1.1 Una venta sin booking cuenta en Cash/Facturación pero NO en close rate
--      ni en atribución. Numerador del close rate = ventas con booking atendido.
--  1.3 Tasa de agenda = COHORTE (agendas de leads del período / leads del
--      período), estructuralmente <=100%. Agendas del período = absoluto aparte.
--  1.7 sales.fecha_cierre define el período de facturación (no created_at).
--  Ratios: NULL cuando el denominador es 0 (el front muestra "—", nunca 0%).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.7 — sales.fecha_cierre (fecha de negocio; default = fecha de la llamada)
-- -----------------------------------------------------------------------------
alter table public.sales add column fecha_cierre timestamptz;

update public.sales s
   set fecha_cierre = coalesce(
     (select b.fecha_llamada from public.bookings b where b.id = s.booking_id),
     s.created_at
   )
 where fecha_cierre is null;

comment on column public.sales.fecha_cierre is 'Fecha de negocio de la venta. Define el período de facturación (created_at es auditoría).';

-- Default + constraint: una venta con booking no puede cerrar antes de la llamada.
create or replace function public.sales_fecha_cierre()
returns trigger language plpgsql set search_path = public as $$
declare v_fll timestamptz;
begin
  if new.booking_id is not null then
    select fecha_llamada into v_fll from public.bookings where id = new.booking_id;
  end if;
  if new.fecha_cierre is null then
    new.fecha_cierre := coalesce(v_fll, new.created_at, now());
  elsif v_fll is not null and new.fecha_cierre < v_fll then
    raise exception 'fecha_cierre (%) anterior a la fecha de la llamada (%)', new.fecha_cierre, v_fll;
  end if;
  return new;
end;
$$;

create trigger trg_sales_fecha_cierre
  before insert or update on public.sales
  for each row execute function public.sales_fecha_cierre();

-- -----------------------------------------------------------------------------
-- 1.2 — calendly_event_id: normalizar a UUID pelado (último segmento de la URI).
-- El bug del duplicado: invitee.created guardaba la URI completa y
-- invitee.canceled el UUID pelado -> el UNIQUE no dispara -> inserta fila nueva.
-- (a) dedup + backfill de lo existente, (b) trigger para que a futuro siempre
-- se guarde pelado (venga como venga).
-- -----------------------------------------------------------------------------

-- (a) Mapeo uuid -> fila que sobrevive (la más vieja = el 'created', suele tener
--     el lead matcheado) + estado del evento MÁS RECIENTE (cancelada gana si es
--     posterior).
create temporary table _dedup_bookings as
select
  regexp_replace(calendly_event_id, '^.*/', '')            as uuid,
  (array_agg(id     order by created_at asc))[1]           as keep_id,
  (array_agg(estado order by created_at desc))[1]          as win_estado
from public.bookings
where calendly_event_id is not null
group by 1;

-- Repuntar calls y sales de las filas perdedoras a la que sobrevive.
update public.calls c set booking_id = d.keep_id
  from public.bookings b
  join _dedup_bookings d on d.uuid = regexp_replace(b.calendly_event_id, '^.*/', '')
  where c.booking_id = b.id and b.id <> d.keep_id;
update public.sales s set booking_id = d.keep_id
  from public.bookings b
  join _dedup_bookings d on d.uuid = regexp_replace(b.calendly_event_id, '^.*/', '')
  where s.booking_id = b.id and b.id <> d.keep_id;

-- Borrar perdedoras (queda una fila por evento).
delete from public.bookings b using _dedup_bookings d
  where regexp_replace(b.calendly_event_id, '^.*/', '') = d.uuid and b.id <> d.keep_id;

-- Normalizar la sobreviviente al UUID pelado + estado ganador.
update public.bookings b
  set calendly_event_id = d.uuid, estado = d.win_estado
  from _dedup_bookings d where b.id = d.keep_id;

-- (b) Trigger: cualquier escritura futura se guarda con el UUID pelado.
create or replace function public.bookings_normalize_event_id()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.calendly_event_id is not null then
    new.calendly_event_id := regexp_replace(new.calendly_event_id, '^.*/', '');
  end if;
  return new;
end;
$$;
create trigger trg_bookings_normalize_event_id
  before insert or update on public.bookings
  for each row execute function public.bookings_normalize_event_id();

-- -----------------------------------------------------------------------------
-- 1.5 — bookings.fecha_llamada NOT NULL. Los sin fecha son payloads reales
-- incompletos: NO se borran, se mueven a bookings_descartados para auditar.
-- -----------------------------------------------------------------------------
create table public.bookings_descartados (
  id                uuid        primary key default gen_random_uuid(),
  calendly_event_id text,
  lead_id           uuid,
  estado            text,
  ig_username       text,
  email             text,
  nombre            text,
  closer            text,
  fecha_llamada     timestamptz,
  motivo            text,
  payload           jsonb,
  origen_created_at timestamptz,
  descartado_at     timestamptz not null default now()
);
alter table public.bookings_descartados enable row level security;
create policy bd_admin_all on public.bookings_descartados
  for all using (public.is_admin()) with check (public.is_admin());
grant all privileges on public.bookings_descartados to authenticated, service_role;

insert into public.bookings_descartados
  (calendly_event_id, lead_id, estado, ig_username, email, nombre, closer, fecha_llamada, motivo, origen_created_at)
select calendly_event_id, lead_id, estado, ig_username, email, nombre, closer, fecha_llamada,
       'fecha_llamada null (payload incompleto)', created_at
from public.bookings where fecha_llamada is null;

delete from public.bookings where fecha_llamada is null;
alter table public.bookings alter column fecha_llamada set not null;

-- =============================================================================
-- Funciones de métricas — reescritas. DROP + CREATE porque cambia la firma.
-- =============================================================================

drop function if exists public.dashboard_kpis(date, date);
create function public.dashboard_kpis(p_start date, p_end date)
returns table (
  leads                 bigint,
  calificados           bigint,
  agendas               bigint,   -- absolutas del período (clase != cancelada)
  atendidas             bigint,
  no_show               bigint,
  resueltas             bigint,
  pendientes            bigint,   -- pasadas sin desenlace cargado
  canceladas            bigint,
  ventas                bigint,   -- todas (incluye sin booking)
  ventas_atribuibles    bigint,   -- con booking atendido (numerador close rate)
  facturacion           numeric,
  cash_collected        numeric,
  aov                   numeric,
  tasa_calificacion     numeric,
  tasa_agenda           numeric,
  show_rate             numeric,
  close_rate_atendidas  numeric,
  close_rate_agendadas  numeric
)
language sql stable security invoker set search_path = public as $$
  with
  l as (
    select * from public.leads
    where crisis = false and fecha_primer_contacto >= p_start and fecha_primer_contacto < p_end
  ),
  -- bookings del período con su clase
  b as (
    select bk.*,
      case
        when bk.estado in ('cancelada','reprogramada') then 'cancelada'
        when bk.estado in ('atendida','no_show') then 'resuelta'
        when bk.fecha_llamada >= now() then 'futura'
        else 'pendiente_desenlace'
      end as clase
    from public.bookings bk
    where not exists (select 1 from public.leads ld where ld.id = bk.lead_id and ld.crisis)
      and bk.fecha_llamada >= p_start and bk.fecha_llamada < p_end
  ),
  -- cohorte: leads DISTINTOS del período que generaron al menos una agenda
  -- (contar leads, no bookings, para que la tasa no pueda pasar de 100%)
  bc as (
    select count(distinct l.id) as leads_agendaron
    from l
    join public.bookings bk on bk.lead_id = l.id
    where bk.estado not in ('cancelada','reprogramada')
  ),
  s as (
    select sl.* from public.sales sl
    where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
      and sl.fecha_cierre >= p_start and sl.fecha_cierre < p_end
  ),
  pay as (
    select pm.* from public.payments pm
    join public.sales sl on sl.id = pm.sale_id
    where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
      and pm.fecha >= p_start and pm.fecha < p_end
  ),
  agg as (
    select
      (select count(*) from l)                                          as leads,
      (select count(*) from l where econ_calificacion = 'calificada')   as calificados,
      (select count(*) from b where clase <> 'cancelada')               as agendas,
      (select leads_agendaron from bc)                                  as leads_agendaron,
      (select count(*) from b where estado = 'atendida')                as atendidas,
      (select count(*) from b where estado = 'no_show')                 as no_show,
      (select count(*) from b where clase = 'resuelta')                 as resueltas,
      (select count(*) from b where clase = 'pendiente_desenlace')      as pendientes,
      (select count(*) from b where clase = 'cancelada')                as canceladas,
      (select count(*) from s)                                          as ventas,
      (select count(*) from s
        where s.booking_id is not null
          and exists (select 1 from public.bookings bk where bk.id = s.booking_id and bk.estado = 'atendida')
      )                                                                 as ventas_atribuibles,
      coalesce((select sum(valor_contrato) from s), 0)                  as facturacion,
      coalesce((select sum(monto) from pay), 0)                         as cash_collected
  )
  select
    leads, calificados, agendas, atendidas, no_show, resueltas,
    pendientes, canceladas, ventas, ventas_atribuibles, facturacion, cash_collected,
    facturacion / nullif(ventas, 0),
    calificados::numeric / nullif(leads, 0),
    leads_agendaron::numeric / nullif(leads, 0),
    atendidas::numeric / nullif(resueltas, 0),
    ventas_atribuibles::numeric / nullif(atendidas, 0),
    ventas_atribuibles::numeric / nullif(agendas, 0)
  from agg
$$;

-- -----------------------------------------------------------------------------
-- Atribución por pieza — bucket 'Sin atribuir' (sin lead / pieza inválida) para
-- que los totales cuadren con las cards. Pieza válida: ^(REEL|CARR|HIST)_\d{4}$.
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_atribucion(date, date);
create function public.dashboard_atribucion(p_start date, p_end date)
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
      case
        when l.pieza_origen ~ '^(REEL|CARR|HIST)_[0-9]{4}$' then l.pieza_origen
        when l.pieza_origen is null or l.pieza_origen = '' then 'Sin atribuir'
        else 'Pieza inválida'
      end as bucket,
      count(*) as leads,
      count(*) filter (where l.econ_calificacion = 'calificada') as calificados
    from public.leads l
    where l.crisis = false and l.fecha_primer_contacto >= p_start and l.fecha_primer_contacto < p_end
    group by 1
  ),
  book_agg as (
    select
      case
        when l.pieza_origen ~ '^(REEL|CARR|HIST)_[0-9]{4}$' then l.pieza_origen
        when l.pieza_origen is null or l.pieza_origen = '' then 'Sin atribuir'
        else 'Pieza inválida'
      end as bucket,
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
      case
        when l.pieza_origen ~ '^(REEL|CARR|HIST)_[0-9]{4}$' then l.pieza_origen
        when l.pieza_origen is null or l.pieza_origen = '' then 'Sin atribuir'
        else 'Pieza inválida'
      end as bucket,
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
      case
        when l.pieza_origen ~ '^(REEL|CARR|HIST)_[0-9]{4}$' then l.pieza_origen
        when l.pieza_origen is null or l.pieza_origen = '' then 'Sin atribuir'
        else 'Pieza inválida'
      end as bucket,
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

-- -----------------------------------------------------------------------------
-- Cortes por dolor / conciencia — devuelven n (= atendidas) para el umbral n<5.
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_por_dolor(date, date);
create function public.dashboard_por_dolor(p_start date, p_end date)
returns table (dolor text, leads bigint, agendas bigint, n bigint, ventas bigint, close_rate numeric)
language sql stable security invoker set search_path = public as $$
  with
  lead_agg as (
    select dolor, count(*) leads from public.leads
    where crisis=false and dolor is not null and fecha_primer_contacto >= p_start and fecha_primer_contacto < p_end
    group by dolor
  ),
  book_agg as (
    select l.dolor, count(*) filter (where b.estado not in ('cancelada','reprogramada')) agendas,
           count(*) filter (where b.estado = 'atendida') atendidas
    from public.bookings b join public.leads l on l.id = b.lead_id
    where l.crisis=false and l.dolor is not null and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
    group by l.dolor
  ),
  sale_agg as (
    select l.dolor, count(*) ventas from public.sales s join public.leads l on l.id = s.lead_id
    where l.crisis=false and l.dolor is not null and s.fecha_cierre >= p_start and s.fecha_cierre < p_end
      and s.booking_id is not null
    group by l.dolor
  ),
  dims as (select dolor from lead_agg union select dolor from book_agg union select dolor from sale_agg)
  select d.dolor, coalesce(la.leads,0), coalesce(ba.agendas,0), coalesce(ba.atendidas,0),
    coalesce(sa.ventas,0), coalesce(sa.ventas,0)::numeric / nullif(coalesce(ba.atendidas,0),0)
  from dims d
  left join lead_agg la on la.dolor=d.dolor
  left join book_agg ba on ba.dolor=d.dolor
  left join sale_agg sa on sa.dolor=d.dolor
  order by 5 desc
$$;

drop function if exists public.dashboard_por_conciencia(date, date);
create function public.dashboard_por_conciencia(p_start date, p_end date)
returns table (conciencia smallint, leads bigint, agendas bigint, n bigint, ventas bigint, close_rate numeric)
language sql stable security invoker set search_path = public as $$
  with
  lead_agg as (
    select conciencia, count(*) leads from public.leads
    where crisis=false and conciencia is not null and fecha_primer_contacto >= p_start and fecha_primer_contacto < p_end
    group by conciencia
  ),
  book_agg as (
    select l.conciencia, count(*) filter (where b.estado not in ('cancelada','reprogramada')) agendas,
           count(*) filter (where b.estado = 'atendida') atendidas
    from public.bookings b join public.leads l on l.id = b.lead_id
    where l.crisis=false and l.conciencia is not null and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
    group by l.conciencia
  ),
  sale_agg as (
    select l.conciencia, count(*) ventas from public.sales s join public.leads l on l.id = s.lead_id
    where l.crisis=false and l.conciencia is not null and s.fecha_cierre >= p_start and s.fecha_cierre < p_end
      and s.booking_id is not null
    group by l.conciencia
  ),
  dims as (select conciencia from lead_agg union select conciencia from book_agg union select conciencia from sale_agg)
  select d.conciencia, coalesce(la.leads,0), coalesce(ba.agendas,0), coalesce(ba.atendidas,0),
    coalesce(sa.ventas,0), coalesce(sa.ventas,0)::numeric / nullif(coalesce(ba.atendidas,0),0)
  from dims d
  left join lead_agg la on la.conciencia=d.conciencia
  left join book_agg ba on ba.conciencia=d.conciencia
  left join sale_agg sa on sa.conciencia=d.conciencia
  order by d.conciencia
$$;

-- -----------------------------------------------------------------------------
-- Performance por closer — n (resueltas) para show, atendidas para close.
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_por_closer(date, date);
create function public.dashboard_por_closer(p_start date, p_end date)
returns table (
  closer text, llamadas bigint, atendidas bigint, no_show bigint, resueltas bigint,
  pendientes bigint, show_rate numeric, ventas bigint, facturacion numeric, aov numeric, close_rate numeric
)
language sql stable security invoker set search_path = public as $$
  with
  book_agg as (
    select b.closer,
      count(*) filter (where b.estado not in ('cancelada','reprogramada')) as llamadas,
      count(*) filter (where b.estado = 'atendida') as atendidas,
      count(*) filter (where b.estado = 'no_show') as no_show,
      count(*) filter (where b.estado in ('atendida','no_show')) as resueltas,
      count(*) filter (where b.estado = 'programada' and b.fecha_llamada < now()) as pendientes
    from public.bookings b
    where b.closer is not null
      and not exists (select 1 from public.leads l where l.id = b.lead_id and l.crisis)
      and b.fecha_llamada >= p_start and b.fecha_llamada < p_end
    group by b.closer
  ),
  sale_agg as (
    select s.closer,
      count(*) filter (where s.booking_id is not null
        and exists (select 1 from public.bookings bk where bk.id = s.booking_id and bk.estado='atendida')) as ventas_atrib,
      count(*) as ventas,
      coalesce(sum(s.valor_contrato),0) as facturacion
    from public.sales s
    where s.closer is not null
      and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
      and s.fecha_cierre >= p_start and s.fecha_cierre < p_end
    group by s.closer
  ),
  dims as (select closer from book_agg union select closer from sale_agg)
  select d.closer,
    coalesce(ba.llamadas,0), coalesce(ba.atendidas,0), coalesce(ba.no_show,0), coalesce(ba.resueltas,0),
    coalesce(ba.pendientes,0),
    coalesce(ba.atendidas,0)::numeric / nullif(coalesce(ba.resueltas,0),0),
    coalesce(sa.ventas,0), coalesce(sa.facturacion,0),
    coalesce(sa.facturacion,0) / nullif(coalesce(sa.ventas,0),0),
    coalesce(sa.ventas_atrib,0)::numeric / nullif(coalesce(ba.atendidas,0),0)
  from dims d
  left join book_agg ba on ba.closer=d.closer
  left join sale_agg sa on sa.closer=d.closer
  order by 9 desc
$$;

-- -----------------------------------------------------------------------------
-- Registros: rows_ventas ahora usa fecha_cierre (para cuadrar con las cards).
-- -----------------------------------------------------------------------------
drop function if exists public.dashboard_rows_ventas(date, date);
create function public.dashboard_rows_ventas(p_start date, p_end date)
returns table (
  sale_id uuid, fecha timestamptz, comprador text, producto text,
  valor_contrato numeric, cash_collected numeric, moneda text, closer text, booking_id uuid
)
language sql stable security invoker set search_path = public as $$
  select sl.id, sl.fecha_cierre, sl.nombre_comprador, sl.producto, sl.valor_contrato,
         coalesce((select sum(p.monto) from public.payments p where p.sale_id = sl.id), 0),
         sl.moneda, sl.closer, sl.booking_id
  from public.sales sl
  where not exists (select 1 from public.leads ld where ld.id = sl.lead_id and ld.crisis)
    and sl.fecha_cierre >= p_start and sl.fecha_cierre < p_end
  order by sl.fecha_cierre desc
$$;

-- -----------------------------------------------------------------------------
-- Re-grant de las funciones recreadas
-- -----------------------------------------------------------------------------
grant execute on function public.dashboard_kpis(date, date)           to authenticated, service_role;
grant execute on function public.dashboard_atribucion(date, date)     to authenticated, service_role;
grant execute on function public.dashboard_por_dolor(date, date)      to authenticated, service_role;
grant execute on function public.dashboard_por_conciencia(date, date) to authenticated, service_role;
grant execute on function public.dashboard_por_closer(date, date)     to authenticated, service_role;
grant execute on function public.dashboard_rows_ventas(date, date)    to authenticated, service_role;
