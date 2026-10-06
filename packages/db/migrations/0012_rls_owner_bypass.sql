-- Qrew 0012 — let the table owner bypass RLS, so the admin path works on managed Postgres.
--
-- 0000 and later migrations FORCEd row-level security, which applies it to the table owner too,
-- and relied on the owner also being a superuser (superusers bypass RLS regardless). That holds in
-- local Docker, where the owner is `postgres`, and nowhere else: on AWS RDS the master user is
-- created NOSUPERUSER with no BYPASSRLS. There, every adminDb query — staff lookup, onboarding, the
-- public card read, leads, customer accounts — matched no rows or failed its WITH CHECK, and the
-- app could not sign anyone in.
--
-- Without FORCE, Postgres' default applies: the owner bypasses RLS, everyone else is subject to it.
-- That is exactly the split the code was written for. qrew_app does not own these tables, so its
-- isolation is unchanged: ENABLE stays on, every tenant policy stays, and the global tables (leads,
-- customer accounts) still have no policy, so qrew_app is still denied them outright.
--
-- What FORCE was meant to guard — the app accidentally connecting as the owner — is now refused at
-- boot instead (assertAppRoleIsolated), which also covers the superuser case FORCE never could.

do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relforcerowsecurity
  loop
    execute format('alter table %I no force row level security', t);
  end loop;
end
$$;
