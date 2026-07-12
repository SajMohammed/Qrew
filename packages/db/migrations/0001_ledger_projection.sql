-- Qrew 0001 — ledger-maintained projection + append-only guard.
--
-- `enrollments.current_stamps` becomes correct-by-construction: a trigger applies each
-- stamp delta on insert, and the ledger is protected from UPDATE so `sum(delta)` is a
-- stable invariant. This removes the need for a reconciliation job to FIX drift — drift
-- is no longer possible. (A periodic audit that merely ALERTS on mismatch is optional.)

-- 1) maintain the projection from the ledger, atomically, on every append — from ANY
--    code path (app, admin, import), not just the service.
create function qrew_apply_stamp_delta() returns trigger
language plpgsql as $$
begin
  update enrollments
     set current_stamps = current_stamps + new.delta
   where id = new.enrollment_id;
  return null; -- AFTER trigger: return value is ignored
end;
$$;

create trigger stamp_events_apply
  after insert on stamp_events
  for each row execute function qrew_apply_stamp_delta();

-- 2) the ledger is append-only: block UPDATE so the balance can never be silently
--    rewritten out from under the projection. DELETE stays allowed — it only happens via
--    cascade when a whole enrollment/merchant is erased (PDPL), which removes the events
--    and the projection together and therefore stays consistent.
create function qrew_forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception 'stamp_events is append-only (UPDATE forbidden)';
end;
$$;

create trigger stamp_events_no_update
  before update on stamp_events
  for each row execute function qrew_forbid_update();
