-- =============================================================================
-- Migración 0005 — Fase C.1: el trato vs. el cobro + metas + gastos
--
-- Cash Collected (plata que entró) != Facturación (valor del contrato cerrado).
-- Con un solo `sales.monto` no se puede. Separamos:
--   sales  = el TRATO (deal). valor_contrato = FACTURACIÓN.
--   payments = un pago recibido por fila. SUM(payments.monto) = CASH COLLECTED.
-- + metas (objetivos por período) y gastos (costos por período).
--
-- `sales.monto` se conserva (no romper la Edge Function de Hotmart), pero la
-- fuente de verdad de facturación pasa a ser `sales.valor_contrato`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. sales -> pasa a representar el TRATO (deal)
-- -----------------------------------------------------------------------------
alter table public.sales
  add column valor_contrato numeric,
  add column tipo           text not null default 'nueva',
  add column producto       text,
  add column cuotas_total   smallint,
  add column closer         text;

alter table public.sales
  add constraint sales_tipo_valido check (tipo in ('nueva', 'recompra', 'upsell', 'backend'));

comment on column public.sales.valor_contrato is 'FACTURACIÓN: valor total del contrato cerrado. Fuente de verdad (monto queda legacy para Hotmart).';
comment on column public.sales.tipo is 'nueva / recompra / upsell / backend';
comment on column public.sales.cuotas_total is 'En cuántas cuotas se pactó (1 = pago único).';
comment on column public.sales.closer is 'Quién cerró la venta (comisiones / performance por closer).';

-- Facturación de las filas existentes = su monto actual.
update public.sales set valor_contrato = monto where valor_contrato is null;
-- Atribuir el closer de las ventas existentes desde su booking.
update public.sales s
   set closer = b.closer
  from public.bookings b
 where b.id = s.booking_id
   and s.closer is null;

-- -----------------------------------------------------------------------------
-- 2. payments — un pago recibido = una fila
-- -----------------------------------------------------------------------------
create table public.payments (
  id                     uuid        primary key default gen_random_uuid(),
  sale_id                uuid        not null references public.sales(id) on delete cascade,
  monto                  numeric,                                   -- la plata que entró en este pago
  moneda                 text        not null default 'USD',
  fecha                  timestamptz,
  metodo_pago            text        not null default 'transferencia',
  hotmart_transaction_id text        unique,                        -- una transacción de Hotmart = un pago
  numero_cuota           smallint,                                  -- 1 = primera/única, 2 = segunda, ...
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint payments_metodo_pago_valido check (metodo_pago in ('hotmart', 'transferencia'))
);

comment on table public.payments is 'Un pago recibido = una fila. SUM(monto) en un período = Cash Collected.';

create index idx_payments_sale_id     on public.payments (sale_id);
create index idx_payments_fecha       on public.payments (fecha);
create index idx_payments_hotmart_txid on public.payments (hotmart_transaction_id);

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Backfill: un primer pago por cada venta existente que tenga monto, para no
-- perder el Cash Collected histórico (fecha = created_at de la venta).
insert into public.payments (sale_id, monto, moneda, fecha, metodo_pago, hotmart_transaction_id, numero_cuota)
select s.id, s.monto, coalesce(s.moneda, 'USD'), coalesce(s.created_at, now()),
       s.metodo_pago, s.hotmart_transaction_id, 1
from public.sales s
where s.monto is not null;

-- -----------------------------------------------------------------------------
-- 3. metas — objetivos por período (mes)
-- -----------------------------------------------------------------------------
create table public.metas (
  id         uuid        primary key default gen_random_uuid(),
  periodo    date        not null,                                  -- primer día del mes
  metrica    text        not null,
  objetivo   numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint metas_metrica_valida check (metrica in (
    'leads', 'tasa_agenda', 'agendas', 'show_rate', 'close_rate',
    'ventas', 'aov', 'facturacion', 'cash_collected'
  )),
  unique (periodo, metrica)
);

create trigger trg_metas_updated_at
  before update on public.metas
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. gastos — costos por período
-- -----------------------------------------------------------------------------
create table public.gastos (
  id         uuid        primary key default gen_random_uuid(),
  periodo    date        not null,                                  -- primer día del mes
  categoria  text        not null,
  concepto   text,
  monto      numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gastos_categoria_valida check (categoria in (
    'closer', 'setter', 'editor', 'ads', 'herramientas', 'otro'
  ))
);

create index idx_gastos_periodo on public.gastos (periodo);

create trigger trg_gastos_updated_at
  before update on public.gastos
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Grants (RLS restringe encima)
-- -----------------------------------------------------------------------------
grant all privileges on public.payments to authenticated, service_role;
grant all privileges on public.metas    to authenticated, service_role;
grant all privileges on public.gastos   to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Helper: ¿la venta es del closer logueado? (vía el booking de la venta)
-- SECURITY DEFINER => bypassea RLS, sin recursión.
-- -----------------------------------------------------------------------------
create or replace function public.closer_owns_sale(s_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.sales s
    join public.bookings b on b.id = s.booking_id
    where s.id = s_id
      and b.closer = public.current_closer_identifier()
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS: payments  (closer ve solo pagos de SUS ventas; setter nada; admin todo)
-- -----------------------------------------------------------------------------
alter table public.payments enable row level security;

create policy payments_admin_all on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

create policy payments_closer_select on public.payments
  for select using (
    public.current_rol() = 'closer' and public.closer_owns_sale(sale_id)
  );

create policy payments_closer_insert on public.payments
  for insert with check (
    public.current_rol() = 'closer' and public.closer_owns_sale(sale_id)
  );

-- -----------------------------------------------------------------------------
-- RLS: metas  (closer y setter LEEN; solo admin escribe)
-- -----------------------------------------------------------------------------
alter table public.metas enable row level security;

create policy metas_admin_all on public.metas
  for all using (public.is_admin()) with check (public.is_admin());

create policy metas_comercial_select on public.metas
  for select using (public.current_rol() in ('closer', 'setter'));

-- -----------------------------------------------------------------------------
-- RLS: gastos  (SOLO admin, lectura y escritura)
-- -----------------------------------------------------------------------------
alter table public.gastos enable row level security;

create policy gastos_admin_all on public.gastos
  for all using (public.is_admin()) with check (public.is_admin());
