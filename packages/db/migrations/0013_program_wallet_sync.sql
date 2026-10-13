-- Qrew 0013 — tell the owner whether a design change reached the passes in customers' phones.
--
-- Saving the card design used to push the new template to Google inline, best-effort, with any
-- failure only logged — the owner saw "Saved" either way and had no way to know a pass hadn't
-- changed. The push now runs on the wallet worker, and these columns are how it reports back.
--
-- Progress is tracked by GENERATION, not by comparing timestamps. Each save increments
-- wallet_sync_generation inside its transaction; the worker records the generation it read in the
-- same snapshot as the design it pushed. "Up to date" is then synced >= requested — exact, and immune
-- to the API's and the worker's clocks disagreeing, or to a job starting between a save's
-- statement and its commit (it would read the old generation, so the save still shows pending).

alter table loyalty_programs
  add column wallet_sync_generation    integer not null default 0, -- bumped by every save that needs a push
  add column wallet_synced_generation  integer not null default 0, -- the newest generation the worker has pushed
  add column wallet_sync_requested_at  timestamptz,                -- database clock; only for spotting a stuck push
  add column wallet_sync_error         text,                       -- the last failure, for support (never shown raw)
  add column wallet_sync_failed_passes integer not null default 0, -- cards whose refresh finally failed
  add column wallet_passes_fingerprint text;                       -- what every pass of the programme last showed

alter table loyalty_programs
  add constraint loyalty_programs_wallet_failed_nonneg check (wallet_sync_failed_passes >= 0);
