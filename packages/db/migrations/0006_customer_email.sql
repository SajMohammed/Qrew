-- Qrew 0006 — merchant CRM: a signed-in customer's email on their customers row.
--
-- A signed-in customer's identity (email) lives on customer_accounts (global, admin-path), which the
-- tenant-scoped dashboard can't read under RLS — so signed-in customers showed as "Guest". Capturing
-- the email onto the merchant's own customers row (at enroll time) lets the dashboard show who
-- enrolled without crossing the tenant boundary. It's the merchant's CRM snapshot, not the source of
-- truth (that stays on the account).
alter table customers add column email text;

-- Backfill existing signed-in customers from their linked account. Migrations run as the DB owner,
-- which bypasses RLS and can read customer_accounts.
update customers c
   set email = a.email
  from customer_accounts a
 where c.customer_account_id = a.id
   and c.email is null;
