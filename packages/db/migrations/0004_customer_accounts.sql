-- Qrew 0004 — customer accounts (OPTIONAL, cross-merchant identity for the consumer "all my cards" app).
-- GLOBAL / admin-path, exactly like leads: a customer is a PERSON, not a tenant — these tables carry
-- no merchant_id and are written only via the admin connection. RLS is enabled with NO policy, so the
-- app role (qrew_app) is denied entirely; the cross-merchant "all my cards" read is authorized by the
-- customer's OWN session (verified in the API), never by a merchant. Merchant dashboards stay strictly
-- RLS-isolated — Café A never sees a customer's Café B activity.
--
-- Staff auth (Clerk) and customer auth (these tables) are deliberately SEPARATE systems.

create table customer_accounts (
  id         uuid primary key default gen_random_uuid(),
  email      text,                          -- canonical email; may be null (Apple private relay)
  created_at timestamptz not null default now()
);
-- one account per email (when present) — lets a second provider with the same VERIFIED email link
-- into the existing account instead of forking a duplicate person.
create unique index customer_accounts_email_uq on customer_accounts(lower(email)) where email is not null;

create table customer_identities (
  id                  uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references customer_accounts(id) on delete cascade,
  provider            text not null,        -- 'google' | 'apple'
  provider_sub        text not null,        -- the provider's stable subject id
  email               text,
  created_at          timestamptz not null default now()
);
-- a given provider identity belongs to exactly one account
create unique index customer_identities_provider_sub_uq on customer_identities(provider, provider_sub);
create index customer_identities_account_idx on customer_identities(customer_account_id);

create table customer_sessions (
  id                  uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references customer_accounts(id) on delete cascade,
  refresh_token_hash  text not null,        -- sha256 of the random refresh token (the raw token is never stored)
  expires_at          timestamptz not null,
  revoked_at          timestamptz,          -- set on logout / rotation; a revoked session can't refresh
  device              text,
  created_at          timestamptz not null default now()
);
create unique index customer_sessions_refresh_uq on customer_sessions(refresh_token_hash);
create index customer_sessions_account_idx on customer_sessions(customer_account_id);

-- link a merchant's customer row to the global person (nullable — walk-ins stay anonymous).
alter table customers add column customer_account_id uuid references customer_accounts(id) on delete set null;
create index customers_account_idx on customers(customer_account_id);

-- global / admin-path: deny-all for qrew_app; only the superuser (adminDb) can touch these.
alter table customer_accounts   enable row level security;
alter table customer_accounts   force row level security;
alter table customer_identities enable row level security;
alter table customer_identities force row level security;
alter table customer_sessions   enable row level security;
alter table customer_sessions   force row level security;
