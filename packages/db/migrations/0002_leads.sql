-- Qrew 0002 — marketing waitlist / early-access leads.
-- NOT tenant-scoped (a prospective merchant has no merchant_id yet). Written only via the
-- admin/superuser connection; RLS is enabled with NO policy, so the app role (qrew_app) is
-- denied entirely and only the superuser path (adminDb) can touch this table.

create table leads (
  id            uuid primary key default gen_random_uuid(),
  business_name text not null,
  email         text not null,
  city          text,
  message       text,
  source        text not null default 'marketing',
  created_at    timestamptz not null default now()
);
create unique index leads_email_uq on leads(email);

alter table leads enable row level security;
alter table leads force row level security;
-- deliberately no policy: deny-all for qrew_app; the superuser (adminDb) bypasses RLS.
