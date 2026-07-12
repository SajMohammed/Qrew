-- Qrew 0000 — schema + row-level tenant isolation.
-- Applied by src/migrate.ts as the DB owner (local dev: the `postgres` superuser).

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ── tables ────────────────────────────────────────────────────────────
create table merchants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  plan       text not null default 'beta',
  created_at timestamptz not null default now()
);

create table locations (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name        text not null,
  timezone    text not null default 'Asia/Dubai',
  created_at  timestamptz not null default now()
);
create index locations_merchant_idx on locations(merchant_id);

create table staff (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references merchants(id) on delete cascade,
  location_id      uuid references locations(id) on delete set null,
  external_auth_id text,
  name             text not null,
  role             text not null default 'cashier',
  pin_hash         text,
  created_at       timestamptz not null default now()
);
create index staff_merchant_idx on staff(merchant_id);

create table loyalty_programs (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null references merchants(id) on delete cascade,
  name            text not null,
  stamps_required integer not null default 10,
  bonus_stamps    integer not null default 2,
  reward_text     text not null default '1 free item',
  card_design     jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index programs_merchant_idx on loyalty_programs(merchant_id);

create table customers (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  phone         text,          -- PII: never leaves me-central-1
  name          text,
  consent_flags jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index customers_merchant_idx on customers(merchant_id);
create unique index customers_merchant_phone_uq on customers(merchant_id, phone);

create table enrollments (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references merchants(id) on delete cascade,
  program_id       uuid not null references loyalty_programs(id) on delete cascade,
  customer_id      uuid not null references customers(id) on delete cascade,
  card_serial      text not null,
  current_stamps   integer not null default 0,   -- cached projection of stamp_events
  apple_pass_id    text,
  google_object_id text,
  status           text not null default 'active',
  created_at       timestamptz not null default now()
);
create index enrollments_merchant_idx on enrollments(merchant_id);
create unique index enrollments_card_serial_uq on enrollments(card_serial);

-- append-only ledger
create table stamp_events (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null references merchants(id) on delete cascade,
  enrollment_id   uuid not null references enrollments(id) on delete cascade,
  location_id     uuid references locations(id) on delete set null,
  staff_id        uuid references staff(id) on delete set null,
  delta           integer not null default 1,
  source          text not null default 'staff_scan',
  idempotency_key text not null,
  created_at      timestamptz not null default now()
);
create index stamp_events_merchant_idx on stamp_events(merchant_id);
create index stamp_events_enrollment_idx on stamp_events(enrollment_id);
create unique index stamp_events_idem_uq on stamp_events(merchant_id, idempotency_key);

-- append-only ledger
create table redemptions (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null references merchants(id) on delete cascade,
  enrollment_id   uuid not null references enrollments(id) on delete cascade,
  staff_id        uuid references staff(id) on delete set null,
  reward_text     text not null,
  stamps_spent    integer not null,
  idempotency_key text not null,
  created_at      timestamptz not null default now()
);
create index redemptions_merchant_idx on redemptions(merchant_id);
create unique index redemptions_idem_uq on redemptions(merchant_id, idempotency_key);

-- ── application role (subject to RLS) ─────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'qrew_app') then
    create role qrew_app login password 'qrew_app';
  end if;
end
$$;

grant usage on schema public to qrew_app;
grant select, insert, update, delete on all tables in schema public to qrew_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to qrew_app;

-- ── row-level security ────────────────────────────────────────────────
-- Every tenant table filters on the session GUC `app.merchant_id`, set per-transaction
-- by withTenant(). ENABLE turns RLS on; FORCE applies it to the table owner too (so it
-- can't be bypassed accidentally). Superusers still bypass — that's how migrations and
-- the admin/reconciliation path work. current_setting(..., true) is NULL when unset, so
-- an un-scoped query matches no rows (deny by default).

-- nullif(..., '') is important: a custom GUC that has been touched but is unset reads
-- back as '' (not NULL), and ''::uuid errors. Coercing '' -> NULL makes an un-scoped
-- query deny cleanly (matches no rows) instead of throwing.

-- merchants is keyed by `id` (a tenant is one merchant row):
alter table merchants enable row level security;
alter table merchants force row level security;
create policy merchants_tenant_isolation on merchants
  using (id = nullif(current_setting('app.merchant_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.merchant_id', true), '')::uuid);

-- all other tenant tables are keyed by `merchant_id`:
do $$
declare
  t text;
begin
  foreach t in array array[
    'locations','staff','loyalty_programs','customers',
    'enrollments','stamp_events','redemptions'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($f$
      create policy %1$s_tenant_isolation on %1$I
        using (merchant_id = nullif(current_setting('app.merchant_id', true), '')::uuid)
        with check (merchant_id = nullif(current_setting('app.merchant_id', true), '')::uuid)
    $f$, t);
  end loop;
end
$$;
