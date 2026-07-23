-- Qrew 0003 — index the staff.external_auth_id tenant tag for the flat Clerk-user auth model.
-- A verified Clerk userId maps to a staff row → merchant_id + role (no Clerk Organizations).
-- external_auth_id is nullable (cashiers use PINs, no Clerk login), so uniqueness is PARTIAL:
-- enforced only on rows that actually carry a Clerk id, letting the many NULLs coexist.

create index staff_external_auth_idx on staff(external_auth_id);
create unique index staff_merchant_external_auth_uq on staff(merchant_id, external_auth_id)
  where external_auth_id is not null;
