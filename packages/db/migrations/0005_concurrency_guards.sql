-- Qrew 0005 — concurrency + integrity guardrails for the loyalty core.
--
-- `withTenant` runs at READ COMMITTED with no row lock, so two simultaneous actions on ONE card
-- could each act on a stale read: two redeems double-issue the reward and drive current_stamps
-- negative; two scans push past the cap (11/10); two enrolls create duplicate cards + double the
-- signup bonus. The service now takes SELECT … FOR UPDATE on the enrollment (serializing stamp /
-- redeem per card); these constraints are the durable backstop that holds from ANY code path.

-- At most one card per customer per program — blocks the duplicate-enrollment / double-bonus race.
-- Non-partial: enrollments are never deactivated today, so (customer_id, program_id) is effectively
-- "one active card". If a leave / re-join flow is added later, make this partial `where status = 'active'`.
create unique index enrollments_customer_program_uq on enrollments(customer_id, program_id);

-- One customer row per (merchant, account) — a signed-in customer can't fork into duplicate rows.
-- Partial: anonymous walk-ins keep customer_account_id NULL and are unaffected.
create unique index customers_merchant_account_uq on customers(merchant_id, customer_account_id)
  where customer_account_id is not null;

-- The projection can never go negative — a redeem that would overspend is rejected at the DB
-- (defense-in-depth behind the FOR UPDATE fix; the trigger's UPDATE fails, rolling the redeem back).
alter table enrollments add constraint enrollments_current_stamps_nonneg check (current_stamps >= 0);
