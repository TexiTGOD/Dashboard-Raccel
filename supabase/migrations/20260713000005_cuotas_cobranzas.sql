-- =============================================================================
-- Migración 0009 — Tanda 2.2: plan de cuotas + cobranzas
--
-- Al crear una venta con cuotas_total, se generan las CUOTAS ESPERADAS (una por
-- cuota) con su vencimiento. Registrar un pago = marcar una cuota como cobrada
-- (link al payment real). Desbloquea cash proyectado y mora.
-- =============================================================================

create table public.cuotas (
  id                uuid        primary key default gen_random_uuid(),
  sale_id           uuid        not null references public.sales(id) on delete cascade,
  numero_cuota      smallint    not null,
  monto_esperado    numeric,
  fecha_vencimiento timestamptz,
  payment_id        uuid        references public.payments(id) on delete set null, -- null = pendiente
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (sale_id, numero_cuota)
);

comment on table public.cuotas is 'Cuotas esperadas de una venta. payment_id null = pendiente; no null = cobrada.';

create index idx_cuotas_sale_id on public.cuotas (sale_id);
create index idx_cuotas_venc on public.cuotas (fecha_vencimiento);

create trigger trg_cuotas_updated_at
  before update on public.cuotas
  for each row execute function public.set_updated_at();

grant all privileges on public.cuotas to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Generación automática de cuotas al crear la venta (AFTER INSERT).
-- -----------------------------------------------------------------------------
create or replace function public.generate_cuotas()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cuotas_total is not null and new.cuotas_total >= 1 and new.valor_contrato is not null then
    insert into public.cuotas (sale_id, numero_cuota, monto_esperado, fecha_vencimiento)
    select new.id, g,
           round(new.valor_contrato / new.cuotas_total, 2),
           coalesce(new.fecha_cierre, new.created_at, now()) + ((g - 1) || ' months')::interval
    from generate_series(1, new.cuotas_total) g
    on conflict (sale_id, numero_cuota) do nothing;
  end if;
  return null;
end;
$$;

create trigger trg_generate_cuotas
  after insert on public.sales
  for each row execute function public.generate_cuotas();

-- -----------------------------------------------------------------------------
-- Backfill: cuotas para ventas existentes + linkear payments ya cargados.
-- -----------------------------------------------------------------------------
insert into public.cuotas (sale_id, numero_cuota, monto_esperado, fecha_vencimiento)
select s.id, g,
       round(s.valor_contrato / s.cuotas_total, 2),
       coalesce(s.fecha_cierre, s.created_at) + ((g - 1) || ' months')::interval
from public.sales s, generate_series(1, s.cuotas_total) g
where s.cuotas_total is not null and s.cuotas_total >= 1 and s.valor_contrato is not null
on conflict (sale_id, numero_cuota) do nothing;

update public.cuotas c
   set payment_id = p.id
  from public.payments p
 where p.sale_id = c.sale_id
   and p.numero_cuota = c.numero_cuota
   and c.payment_id is null;

-- -----------------------------------------------------------------------------
-- RLS: cuotas (closer solo las de sus ventas; setter nada; admin todo)
-- -----------------------------------------------------------------------------
alter table public.cuotas enable row level security;

create policy cuotas_admin_all on public.cuotas
  for all using (public.is_admin()) with check (public.is_admin());

create policy cuotas_closer_select on public.cuotas
  for select using (public.current_rol() = 'closer' and public.closer_owns_sale(sale_id));

create policy cuotas_closer_insert on public.cuotas
  for insert with check (public.current_rol() = 'closer' and public.closer_owns_sale(sale_id));

create policy cuotas_closer_update on public.cuotas
  for update using (public.current_rol() = 'closer' and public.closer_owns_sale(sale_id))
  with check (public.current_rol() = 'closer' and public.closer_owns_sale(sale_id));

-- -----------------------------------------------------------------------------
-- Cobranzas: mora (cuotas vencidas y no cobradas) — sin período (vencida es
-- vencida). Crisis excluido.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_mora()
returns table (
  cuota_id uuid, sale_id uuid, numero_cuota smallint, monto_esperado numeric,
  fecha_vencimiento timestamptz, dias_vencida integer, comprador text, producto text, booking_id uuid
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.sale_id, c.numero_cuota, c.monto_esperado, c.fecha_vencimiento,
         extract(day from (now() - c.fecha_vencimiento))::int,
         s.nombre_comprador, s.producto, s.booking_id
  from public.cuotas c
  join public.sales s on s.id = c.sale_id
  where c.payment_id is null
    and c.fecha_vencimiento < now()
    and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
  order by c.fecha_vencimiento asc
$$;

-- Cuotas que vencen en el período (para cash proyectado + próximos vencimientos).
create or replace function public.dashboard_cuotas_periodo(p_start date, p_end date)
returns table (
  cuota_id uuid, sale_id uuid, numero_cuota smallint, monto_esperado numeric,
  fecha_vencimiento timestamptz, cobrada boolean, comprador text, producto text, booking_id uuid
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.sale_id, c.numero_cuota, c.monto_esperado, c.fecha_vencimiento,
         (c.payment_id is not null), s.nombre_comprador, s.producto, s.booking_id
  from public.cuotas c
  join public.sales s on s.id = c.sale_id
  where c.fecha_vencimiento >= p_start and c.fecha_vencimiento < p_end
    and not exists (select 1 from public.leads l where l.id = s.lead_id and l.crisis)
  order by c.fecha_vencimiento asc
$$;

grant execute on function public.dashboard_mora()                       to authenticated, service_role;
grant execute on function public.dashboard_cuotas_periodo(date, date)   to authenticated, service_role;
