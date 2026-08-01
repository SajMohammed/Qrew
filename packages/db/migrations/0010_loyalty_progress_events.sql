-- Qrew 0010 — rename the ledger for a world with more than one kind of card.
--
-- `stamp_events` was named when a stamp card was the only product. It is really a signed,
-- append-only record of how far a customer has got: a stamp card appends +1, a points card
-- appends +250, a redemption appends a negative delta. Only the unit differs. A points card
-- writing delta=250 into a table called `stamp_events` would read as a bug to whoever comes next.
--
-- Deliberately NOT `balance_events` / `credit_events`: "balance" and "credit" are the vocabulary
-- of stored value, and a loyalty programme is specifically not that. Progress is what this counts.
--
-- Pure rename — no data moves, no semantics change. Every existing test passes untouched, which is
-- the proof. Done now because it is nearly free pre-launch and expensive once passes are live.

alter table stamp_events rename to loyalty_progress_events;
alter table enrollments rename column current_stamps to current_progress;

-- Postgres carries indexes, policies and triggers across a table rename but keeps their old names.
alter index stamp_events_pkey rename to loyalty_progress_events_pkey;
alter index stamp_events_merchant_idx rename to loyalty_progress_events_merchant_idx;
alter index stamp_events_enrollment_idx rename to loyalty_progress_events_enrollment_idx;
alter index stamp_events_idem_uq rename to loyalty_progress_events_idem_uq;
alter index stamp_events_merchant_created_idx rename to loyalty_progress_events_merchant_created_idx;

alter policy stamp_events_tenant_isolation on loyalty_progress_events
  rename to loyalty_progress_events_tenant_isolation;

alter table enrollments
  rename constraint enrollments_current_stamps_nonneg to enrollments_current_progress_nonneg;

-- The projection trigger from 0001, renamed and pointed at the renamed column.
create function qrew_apply_progress_delta() returns trigger
language plpgsql as $$
begin
  update enrollments
     set current_progress = current_progress + new.delta
   where id = new.enrollment_id;
  return null; -- AFTER trigger: return value is ignored
end;
$$;

drop trigger stamp_events_apply on loyalty_progress_events;
create trigger loyalty_progress_events_apply
  after insert on loyalty_progress_events
  for each row execute function qrew_apply_progress_delta();

drop function qrew_apply_stamp_delta();

-- Say which table refused the write instead of hardcoding a name that a later rename would
-- silently falsify — this guard is generic and may come to protect other append-only tables.
create or replace function qrew_forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only (UPDATE forbidden)', tg_table_name;
end;
$$;

alter trigger stamp_events_no_update on loyalty_progress_events
  rename to loyalty_progress_events_no_update;
