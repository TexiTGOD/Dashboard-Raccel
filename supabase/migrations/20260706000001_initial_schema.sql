-- =============================================================================
-- Migración 0001 — Schema inicial
-- Sistema de atribución y seguimiento de leads (proyecto Linda Meneghelli)
--
-- 4 tablas: leads, bookings, calls, sales
-- + funciones de normalización, trigger de updated_at, índices de matcheo, RLS.
-- Los triggers de matcheo van en la migración 0002.
-- =============================================================================

-- gen_random_uuid() vive en el core desde PG13, pero pgcrypto lo garantiza.
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helpers de normalización (fuente de verdad del matcheo)
-- -----------------------------------------------------------------------------

-- Handle de Instagram: sin @, minúsculas, sin espacios. Devuelve NULL si queda vacío.
create or replace function public.normalize_handle(raw text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(lower(trim(coalesce(raw, ''))), '^@+', ''),
    ''
  );
$$;

-- Email: minúsculas, sin espacios. Devuelve NULL si queda vacío.
create or replace function public.normalize_email(raw text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(raw, ''))), '');
$$;

-- Setea updated_at = now() en cada UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- leads  (fuente: ManyChat, vía webhook)
-- -----------------------------------------------------------------------------
create table public.leads (
  id                     uuid        primary key default gen_random_uuid(),
  manychat_contact_id    text        not null unique,               -- llave estable
  ig_username            text,                                       -- sin @, lowercase (llave de matcheo con bookings)
  nombre                 text,
  fecha_primer_contacto  timestamptz,
  pieza_origen           text,                                       -- atribución: REEL_DDMM / CARR_DDMM / HIST_DDMM
  respuesta_lead         text,                                       -- ManyChat: Respuesta_Primer_contacto
  respuesta_lead_2       text,
  dolor                  text,
  conciencia             smallint,                                   -- 1..6, valor de ENTRADA, se congela
  crisis                 boolean     not null default false,         -- protocolo no negociable
  econ_declarada         text,                                       -- 'pais|ocupacion' o 'no'
  respuesta_econ         text,
  econ_calificacion      text,                                       -- calificada / zona_gris / no_calificada
  estado_funnel          text,                                       -- lead_calificado / lead_gris / lead_descalificado / lead_fria ...
  feedback_descalificada text,                                       -- atribución negativa (nullable)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint leads_conciencia_rango
    check (conciencia is null or conciencia between 1 and 6),
  constraint leads_dolor_valido
    check (dolor is null or dolor in (
      'no_puedo_soltar', 'ansiedad_apego', 'comparacion_otra',
      'darlo_todo_no_elegida', 'hombre_ambiguo', 'no_disponible'
    )),
  constraint leads_econ_calificacion_valida
    check (econ_calificacion is null or econ_calificacion in (
      'calificada', 'zona_gris', 'no_calificada'
    ))
);

comment on table  public.leads is 'Leads capturados y clasificados por ManyChat + Claude. Upsert por manychat_contact_id.';
comment on column public.leads.conciencia is 'Nivel 1..6 clasificado por Claude. Valor de entrada, NO se actualiza en recalificaciones.';
comment on column public.leads.pieza_origen is 'Pieza de atribución. NO se pisa en recalificaciones (se conserva la original).';

-- -----------------------------------------------------------------------------
-- bookings  (fuente: Calendly, vía Zapier)
-- -----------------------------------------------------------------------------
create table public.bookings (
  id                 uuid        primary key default gen_random_uuid(),
  calendly_event_id  text        not null unique,          -- llave de matcheo con calls
  ig_username        text,                                 -- prefillado desde ManyChat (?a1=...). Llave lead↔booking
  email              text,                                 -- email con que agendó. Llave lead↔sale (vía bookings)
  nombre             text,
  closer             text,                                 -- owner del event type de Calendly
  fecha_llamada      timestamptz,
  estado             text,
  lead_id            uuid        references public.leads(id) on delete set null,  -- se llena en el matcheo
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint bookings_estado_valido
    check (estado is null or estado in (
      'programada', 'atendida', 'no_show', 'reprogramada', 'cancelada'
    ))
);

comment on table public.bookings is 'Llamadas agendadas en Calendly. Upsert por calendly_event_id. lead_id se resuelve por ig_username.';

-- -----------------------------------------------------------------------------
-- calls  (fuente: Fathom, vía Zapier — trigger "New AI Summary")
-- -----------------------------------------------------------------------------
create table public.calls (
  id              uuid        primary key default gen_random_uuid(),
  booking_id      uuid        references public.bookings(id) on delete set null,
  resumen_fathom  text,
  transcript_url  text,
  notas_closer    text,                                    -- lo carga el closer a mano (fase dashboard)
  resultado       text        not null default 'pendiente',
  fecha           timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint calls_resultado_valido
    check (resultado in ('vendido', 'perdido', 'follow_up', 'pendiente'))
);

comment on table public.calls is 'Resúmenes AI de Fathom. booking_id se resuelve en la ingestión por calendly_event_id o email del asistente.';

-- -----------------------------------------------------------------------------
-- sales  (fuente: Hotmart, vía webhook + carga manual para transferencias)
-- -----------------------------------------------------------------------------
create table public.sales (
  id                     uuid        primary key default gen_random_uuid(),
  hotmart_transaction_id text        unique,               -- nullable: transferencias manuales no tienen
  email_comprador        text,                             -- llave de matcheo con bookings/leads por email
  nombre_comprador       text,
  monto                  numeric,
  moneda                 text,                             -- Hotmart opera en USD para este negocio
  status                 text,                             -- approved / refunded / chargeback / cancelled + manuales
  metodo_pago            text        not null default 'hotmart',
  lead_id                uuid        references public.leads(id) on delete set null,
  booking_id             uuid        references public.bookings(id) on delete set null,
  matcheada              boolean     not null default false,  -- si el matcheo automático por email funcionó
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint sales_metodo_pago_valido
    check (metodo_pago in ('hotmart', 'transferencia'))
);

comment on table  public.sales is 'Ventas de Hotmart + transferencias manuales. Upsert por hotmart_transaction_id. Matcheo frágil por email.';
comment on column public.sales.matcheada is 'true si el matcheo automático por email encontró un booking. Las false se concilian a mano (fase dashboard).';

-- -----------------------------------------------------------------------------
-- Triggers de updated_at
-- -----------------------------------------------------------------------------
create trigger trg_leads_updated_at    before update on public.leads    for each row execute function public.set_updated_at();
create trigger trg_bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();
create trigger trg_calls_updated_at    before update on public.calls    for each row execute function public.set_updated_at();
create trigger trg_sales_updated_at    before update on public.sales    for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Índices en las llaves de matcheo
-- (los UNIQUE ya generan índice: manychat_contact_id, calendly_event_id, hotmart_transaction_id)
-- -----------------------------------------------------------------------------
create index idx_leads_ig_username      on public.leads    (ig_username);
create index idx_bookings_ig_username   on public.bookings (ig_username);
create index idx_bookings_email         on public.bookings (email);
create index idx_bookings_lead_id       on public.bookings (lead_id);
create index idx_calls_booking_id       on public.calls    (booking_id);
create index idx_sales_email_comprador  on public.sales    (email_comprador);
create index idx_sales_lead_id          on public.sales    (lead_id);
create index idx_sales_booking_id       on public.sales    (booking_id);

-- -----------------------------------------------------------------------------
-- RLS activado desde el día uno.
-- En esta fase el acceso es SOLO por service_role (que hace bypass de RLS) desde
-- las Edge Functions. No creamos policies todavía: sin policies, anon/authenticated
-- no ven nada. Las policies por rol (setter / closer / creador) vienen en la fase
-- del dashboard.
-- -----------------------------------------------------------------------------
alter table public.leads    enable row level security;
alter table public.bookings enable row level security;
alter table public.calls    enable row level security;
alter table public.sales    enable row level security;
