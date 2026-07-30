-- Qrew 0008 — indexes for the shop analytics / CRM dashboard.
--
-- The dashboard reads the ledger by TIME (stamps per day, "this period vs last period") and joins
-- redemptions back to a card. Today `stamp_events` is indexed on (merchant_id) and (enrollment_id)
-- only, and `redemptions` has no enrollment index at all — so every time-bucketed panel degrades to
-- a merchant-wide scan that grows with the shop's whole history, not with the window being asked for.
--
-- RLS already restricts rows to one merchant, so the merchant_id-leading composite is what actually
-- gets used: the planner filters the tenant and then range-scans created_at.

-- "Stamps per day", period totals, and last-visit lookups all scan the ledger by time within a tenant.
create index stamp_events_merchant_created_idx on stamp_events(merchant_id, created_at);

-- Per-card redemption counts ("has this customer ever earned a reward?") join on enrollment_id,
-- which had no index — this was a sequential scan of the merchant's entire redemption history per row.
create index redemptions_enrollment_idx on redemptions(enrollment_id);

-- "Rewards redeemed in the last N days" and the recent-activity feed.
create index redemptions_merchant_created_idx on redemptions(merchant_id, created_at);
