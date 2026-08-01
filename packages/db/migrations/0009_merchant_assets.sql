-- Qrew 0009 — images a shop uploads for their card design.
--
-- The card designer lets a shop set stamp artwork and a logo by URL, which assumes they already
-- host an image somewhere public. A café owner does not. So we host it: they pick a PNG, it lands
-- here, and the design points at our own public asset route.
--
-- Bytes live in Postgres rather than object storage on purpose. These are small (a stamp icon is a
-- few KB, capped at 512 KB) and there are a handful per shop, so a blob store would add a second
-- system, a second set of credentials and a second residency question for no benefit at this size.
-- The database is already in-region and already backed up. If shops ever upload photography this
-- should move to S3 in me-central-1 — the read path is a single function, so that swap stays local.

create table merchant_assets (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  -- What the image is for. Not an enum: the set of design slots is still moving.
  kind         text not null,
  content_type text not null default 'image/png',
  bytes        bytea not null,
  -- Decoded on upload and stored, so the designer can show dimensions without re-decoding.
  width        integer not null,
  height       integer not null,
  created_at   timestamptz not null default now()
);

create index merchant_assets_merchant_idx on merchant_assets(merchant_id);

-- Tenant-isolated exactly like every other merchant-owned table. The PUBLIC read path
-- (Google fetching the image) goes through adminDb keyed by the asset's random id, which is the
-- capability — the same rule the card serial already follows.
alter table merchant_assets enable row level security;
alter table merchant_assets force row level security;
create policy merchant_assets_tenant_isolation on merchant_assets
  using (merchant_id = nullif(current_setting('app.merchant_id', true), '')::uuid)
  with check (merchant_id = nullif(current_setting('app.merchant_id', true), '')::uuid);
