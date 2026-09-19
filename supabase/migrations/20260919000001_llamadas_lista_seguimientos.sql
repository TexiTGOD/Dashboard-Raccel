-- Tanda 4 (parte 1): Vista Lista de llamadas + Seguimientos pendientes +
-- Venta sin registrar + Pipeline consistente con la Lista.
--
-- IDEMPOTENTE: se puede correr más de una vez. Todo es create or replace /
-- drop function if exists + create / create index if not exists / grant.
-- Va en una transacción: el DROP + CREATE de las funciones que cambian de
-- forma de retorno es atómico (nadie ve "la función no existe" entre medio).
--
-- DEPENDENCIA: requiere la migración de la Tanda 2 (closer_pct_comision,
-- current_closer_identifier) y la de la Tanda 3 (columnas de calls).
--
-- ORDEN DE DEPLOY: SQL primero, merge/deploy del frontend después (el
-- frontend nuevo llama a dashboard_llamadas_chips/_lista, que no existen
-- todavía en prod). El frontend viejo NO se rompe con este SQL: ver notas en
-- el chat (las únicas funciones que ya existían y cambian de forma son
-- dashboard_pipeline_llamadas, que solo SUMA 2 columnas al final).
--
-- Trae:
--   1. hoy_argentina(): "hoy" en America/Argentina/Buenos_Aires, no UTC.
--      Parametrizada (p_now) para poder testear con timestamps fijos.
--   2. Helpers COMPARTIDOS por Lista y Pipeline (antes la lógica estaba
--      escrita a mano en cada función y podía driftear):
--        es_sin_desenlace()         (+2hs de margen)
--        es_seguimiento_pendiente()
--   3. pipeline_clase_llamada usa es_sin_desenlace(): "atendida sin resultado"
--      pasa de Atendida a Pendiente de desenlace; una llamada recién terminada
--      (<2hs) se queda en Programada. dashboard_pipeline_llamadas / _counts
--      incluyen SIEMPRE un seguimiento pendiente aunque la llamada sea de otro
--      mes, y devuelven proximo_seguimiento + es_vencido para la tarjeta.
--   4. dashboard_llamadas_lista / dashboard_llamadas_chips: tabla + contadores
--      de los 4 accesos rápidos (Seguimientos pendientes, Sin desenlace,
--      Venta sin registrar, Todas).
--   5. FIX dashboard_closer_metricas (Tanda 2): comparaba p_start/p_end (date)
--      contra timestamptz con cast implícito a medianoche UTC; ahora ancla a
--      medianoche Argentina. Ojo: el resto del dashboard (Operaciones, Equipo,
--      Setter) sigue anclado a UTC — queda como deuda para una tanda aparte.
--   6. Índice parcial para el filtro de seguimientos pendientes.

begin;

-- ============================================================
-- "Hoy" en Argentina, no en UTC.
-- ============================================================
create or replace function public.hoy_argentina(p_now timestamptz default now())
returns date
language sql
stable
as $$ select (p_now at time zone 'America/Argentina/Buenos_Aires')::date $$;

comment on function public.hoy_argentina(timestamptz) is
  '"Hoy" en hora de Argentina, no UTC. p_now es parámetro para poder testear con timestamps fijos sin tocar el reloj del sistema.';

-- ============================================================
-- Helpers compartidos entre Pipeline y Lista.
-- ============================================================
create or replace function public.es_sin_desenlace(p_estado text, p_fecha timestamptz, p_resultado text)
returns boolean
language sql
stable
as $$
  select p_estado not in ('cancelada','reprogramada','no_show')
     and (p_resultado is null or p_resultado = 'pendiente')
     and p_fecha < (now() - interval '2 hours')
$$;

comment on function public.es_sin_desenlace(text, timestamptz, text) is
  'Llamada que ya pasó (+2hs de margen) y no tiene resultado cargado. Único lugar: lo usan Lista (sin_desenlace) y Pipeline (pipeline_clase_llamada) por igual.';

create or replace function public.es_seguimiento_pendiente(p_resultado text, p_proximo date)
returns boolean
language sql
stable
as $$
  select p_resultado = 'follow_up'
     and p_proximo is not null
     and p_proximo <= public.hoy_argentina()
$$;

comment on function public.es_seguimiento_pendiente(text, date) is
  'Follow up con próximo seguimiento hoy o vencido. Único lugar: lo usan Lista (seguimientos) y Pipeline (dashboard_pipeline_llamadas, para no esconderlos por el filtro de fecha).';

-- ============================================================
-- Clasificación del Pipeline: usa es_sin_desenlace().
-- (misma firma que la de antes: create or replace conserva el grant)
-- ============================================================
create or replace function public.pipeline_clase_llamada(
  p_estado    text,
  p_fecha     timestamptz,
  p_resultado text
)
returns text
language sql stable set search_path = public as $$
  select case
    when p_estado in ('cancelada','reprogramada')                    then 'cancelada'
    when p_estado = 'no_show'                                        then 'no_show'
    when p_estado = 'atendida' and p_resultado = 'vendido'           then 'vendido'
    when p_estado = 'atendida' and p_resultado = 'perdido'           then 'perdido'
    when public.es_sin_desenlace(p_estado, p_fecha, p_resultado)     then 'pendiente'
    when p_estado = 'atendida'                                       then 'atendida'
    else                                                                   'programada'
  end
$$;

-- ============================================================
-- Filas del pipeline. CAMBIA la forma de retorno (suma proximo_seguimiento y
-- es_vencido AL FINAL): hay que dropear y recrear, y volver a dar el grant.
-- ============================================================
drop function if exists public.dashboard_pipeline_llamadas(date, date);
create function public.dashboard_pipeline_llamadas(p_start date, p_end date)
returns table (
  booking_id           uuid,
  fecha                timestamptz,
  lead_nombre          text,
  ig                   text,
  closer               text,
  estado               text,
  resultado            text,
  pieza                text,
  clase                text,
  proximo_seguimiento  date,
  es_vencido           boolean
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
           r.proximo_seguimiento                       as b_proximo,
           public.pipeline_clase_llamada(b.estado, b.fecha_llamada, r.resultado) as b_clase
    from public.bookings b
    left join public.leads l on l.id = b.lead_id
    left join lateral (
      select c.resultado, c.proximo_seguimiento
      from public.calls c
      where c.booking_id = b.id
      order by c.created_at desc
      limit 1
    ) r on true
    where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
      and (
        (b.fecha_llamada >= p_start and b.fecha_llamada < p_end)
        or public.es_seguimiento_pendiente(r.resultado, r.proximo_seguimiento)
      )
  )
  select b_id, b_fecha, b_nombre, b_ig, b_closer, b_estado, b_resultado, b_pieza, b_clase,
         b_proximo,
         (b_proximo is not null and b_proximo < public.hoy_argentina())
  from base
  -- Las programadas por cercanía (la próxima primero); el resto, lo más
  -- reciente primero. El id desempata: orden TOTAL (paginable con range).
  order by
    case when b_clase = 'programada' then 0 else 1 end,
    case when b_clase = 'programada' then b_fecha end asc,
    b_fecha desc,
    b_id desc
$$;

-- Conteos por columna: mismo filtro que las filas. Misma forma de retorno que
-- antes (create or replace conserva el grant).
create or replace function public.dashboard_pipeline_llamadas_counts(p_start date, p_end date)
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
    select public.pipeline_clase_llamada(b.estado, b.fecha_llamada, r.resultado) as clase
    from public.bookings b
    left join lateral (
      select c.resultado, c.proximo_seguimiento
      from public.calls c
      where c.booking_id = b.id
      order by c.created_at desc
      limit 1
    ) r on true
    where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
      and (
        (b.fecha_llamada >= p_start and b.fecha_llamada < p_end)
        or public.es_seguimiento_pendiente(r.resultado, r.proximo_seguimiento)
      )
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

-- ============================================================
-- FIX Tanda 2: límites de período anclados a medianoche Argentina.
-- Misma firma y forma de retorno (create or replace conserva el grant).
-- ============================================================
create or replace function public.dashboard_closer_metricas(p_start date, p_end date)
returns table (
  llamadas             bigint,
  atendidas            bigint,
  resueltas            bigint,
  show_rate            numeric,
  ventas               bigint,
  ventas_atribuibles   bigint,
  close_rate_atendidas numeric,
  cash_collected       numeric,
  pct_comision         numeric,
  comision             numeric
)
language sql stable security invoker set search_path = public as $$
  with
  rango as (
    select
      (p_start::timestamp at time zone 'America/Argentina/Buenos_Aires') as desde,
      (p_end::timestamp at time zone 'America/Argentina/Buenos_Aires') as hasta
  ),
  book_agg as (
    select
      count(*) filter (where b.estado not in ('cancelada','reprogramada')) as llamadas,
      count(*) filter (where b.estado = 'atendida') as atendidas,
      count(*) filter (where b.estado in ('atendida','no_show')) as resueltas
    from public.bookings b, rango
    where b.closer = public.current_closer_identifier()
      and not exists (select 1 from public.leads l where l.id = b.lead_id and l.crisis)
      and b.fecha_llamada >= rango.desde and b.fecha_llamada < rango.hasta
  ),
  sale_agg as (
    select
      count(*) filter (where exists (
        select 1 from public.bookings bk where bk.id = s.booking_id and bk.estado = 'atendida'
      )) as ventas_atrib,
      count(*) as ventas
    from public.sales s, rango
    where s.booking_id is not null
      and exists (
        select 1 from public.bookings bk
        where bk.id = s.booking_id and bk.closer = public.current_closer_identifier()
      )
      and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
      and s.fecha_cierre >= rango.desde and s.fecha_cierre < rango.hasta
  ),
  cash_agg as (
    select coalesce(sum(pm.monto), 0) as cash
    from public.payments pm
    join public.sales s on s.id = pm.sale_id
    join public.bookings bk on bk.id = s.booking_id, rango
    where bk.closer = public.current_closer_identifier()
      and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
      and pm.fecha >= rango.desde and pm.fecha < rango.hasta
  )
  select
    ba.llamadas,
    ba.atendidas,
    ba.resueltas,
    ba.atendidas::numeric / nullif(ba.resueltas, 0),
    sa.ventas,
    sa.ventas_atrib,
    sa.ventas_atrib::numeric / nullif(ba.atendidas, 0),
    ca.cash,
    public.closer_pct_comision(),
    round(ca.cash * public.closer_pct_comision(), 2)
  from book_agg ba, sale_agg sa, cash_agg ca
$$;

-- ============================================================
-- Vista Lista: filas. Función nueva en prod; el drop if exists la deja
-- re-ejecutable aunque la forma de retorno cambie a futuro.
-- ============================================================
drop function if exists public.dashboard_llamadas_lista(text, text, text, text, text, date, date);
create function public.dashboard_llamadas_lista(
  p_vista     text,             -- 'seguimientos' | 'sin_desenlace' | 'venta_sin_registrar' | 'todas'
  p_resultado text default null, -- solo aplica con p_vista = 'todas'
  p_producto  text default null,
  p_objecion  text default null,
  p_closer    text default null,
  p_start     date default null, -- solo aplica con p_vista = 'todas'
  p_end       date default null
)
returns table (
  booking_id           uuid,
  fecha                timestamptz,
  lead_nombre          text,
  closer               text,
  estado               text,
  resultado            text,
  producto_ofrecido    text,
  precio_ofrecido      numeric,
  objeciones           text[],
  proximo_seguimiento  date,
  es_vencido           boolean
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select
      b.id as booking_id, b.fecha_llamada as fecha,
      coalesce(l.nombre, b.nombre) as lead_nombre,
      b.closer, b.estado, c.resultado, c.producto_ofrecido, c.precio_ofrecido,
      c.objeciones, c.proximo_seguimiento,
      exists (select 1 from public.sales s where s.booking_id = b.id) as tiene_venta
    from public.bookings b
    left join public.leads l on l.id = b.lead_id
    left join lateral (
      select * from public.calls c2 where c2.booking_id = b.id order by c2.created_at desc limit 1
    ) c on true
    where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
      and (p_closer is null or b.closer = p_closer)
      and (p_vista <> 'todas' or p_resultado is null or c.resultado = p_resultado)
      and (p_producto is null or c.producto_ofrecido = p_producto)
      and (p_objecion is null or c.objeciones @> array[p_objecion]::text[])
  )
  select
    booking_id, fecha, lead_nombre, closer, estado, resultado,
    producto_ofrecido, precio_ofrecido, objeciones, proximo_seguimiento,
    (proximo_seguimiento is not null and proximo_seguimiento < public.hoy_argentina())
  from base
  where case p_vista
    when 'seguimientos' then public.es_seguimiento_pendiente(resultado, proximo_seguimiento)
    when 'sin_desenlace' then public.es_sin_desenlace(estado, fecha, resultado)
    when 'venta_sin_registrar' then resultado = 'vendido' and not tiene_venta
    else
      (p_start is null or fecha >= (p_start::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (p_end is null or fecha < (p_end::timestamp at time zone 'America/Argentina/Buenos_Aires'))
  end
  order by
    case when p_vista = 'seguimientos' then proximo_seguimiento end asc nulls last,
    case when p_vista <> 'seguimientos' then fecha end desc nulls last,
    booking_id
$$;

-- ============================================================
-- Contadores de los accesos rápidos (y del badge del sidebar). RLS-scoped
-- por quien llama: closer ve lo suyo, admin el total.
-- ============================================================
drop function if exists public.dashboard_llamadas_chips();
create function public.dashboard_llamadas_chips()
returns table (
  seguimientos_pendientes bigint,
  sin_desenlace           bigint,
  venta_sin_registrar     bigint
)
language sql stable security invoker set search_path = public as $$
  select
    count(*) filter (where public.es_seguimiento_pendiente(c.resultado, c.proximo_seguimiento)),
    count(*) filter (where public.es_sin_desenlace(b.estado, b.fecha_llamada, c.resultado)),
    count(*) filter (
      where c.resultado = 'vendido'
        and not exists (select 1 from public.sales s where s.booking_id = b.id)
    )
  from public.bookings b
  left join lateral (
    select * from public.calls c2 where c2.booking_id = b.id order by c2.created_at desc limit 1
  ) c on true
  where not exists (select 1 from public.leads ld where ld.id = b.lead_id and ld.crisis)
$$;

-- ============================================================
-- GRANTS. Se dan TODOS explícitamente (no solo los de las funciones
-- dropeadas): el DROP se lleva puesto el grant, y re-otorgar los demás es
-- inocuo. Los helpers (hoy_argentina, es_*) no se llaman desde el cliente,
-- pero los ejecutan estas funciones con el rol del que llama: quedan con el
-- EXECUTE por defecto de PUBLIC, igual que closer_pct_comision() y demás
-- helpers de tandas anteriores.
-- ============================================================
grant execute on function public.pipeline_clase_llamada(text, timestamptz, text)                          to authenticated, service_role;
grant execute on function public.dashboard_pipeline_llamadas(date, date)                                  to authenticated, service_role;
grant execute on function public.dashboard_pipeline_llamadas_counts(date, date)                           to authenticated, service_role;
grant execute on function public.dashboard_closer_metricas(date, date)                                    to authenticated, service_role;
grant execute on function public.dashboard_llamadas_lista(text, text, text, text, text, date, date)       to authenticated, service_role;
grant execute on function public.dashboard_llamadas_chips()                                               to authenticated, service_role;

-- Índice parcial: el filtro de seguimientos pendientes siempre busca
-- resultado=follow_up con proximo_seguimiento acotado.
create index if not exists idx_calls_seguimiento_pendiente
  on public.calls (proximo_seguimiento)
  where resultado = 'follow_up';

commit;

-- Refresca el schema cache de PostgREST (por si quedó cacheada la forma vieja).
notify pgrst, 'reload schema';
