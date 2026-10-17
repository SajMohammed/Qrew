-- Qrew 0015 — a shop runs one card of each type, and turning a type off freezes its card.
--
-- A shop can now run a stamp, points, membership and discount card side by side, at most one of
-- each, each fully separate: its own design, counter QR, customers and numbers. The programme row
-- already is "a card", so a card type is simply the shop's programme of that type. No new table:
--
--   • status      'active' (on: takes new members and progress) or 'frozen' (turned off). A frozen
--                 card stays in customers' wallets and can still be redeemed; it takes no new joins
--                 and no new progress. It replaces the `active` flag, which nothing ever cleared.
--   • enabled_at  when this card was last turned on — the record pricing will read later.
--   • frozen_at   when it was last turned off; null while it is on.
--
-- Turning a type back on unfreezes the same row, so its customers' cards carry on. Only the latest
-- on/off pair is kept, not every toggle: billing will record its own events when it is built, and
-- until then the row answers "what does this shop run, and since when".

alter table loyalty_programs
  add column status     text not null default 'active',
  add column enabled_at timestamptz,
  add column frozen_at  timestamptz;

-- Every existing programme was turned on when it was created.
update loyalty_programs set enabled_at = created_at;
alter table loyalty_programs
  alter column enabled_at set not null,
  alter column enabled_at set default now();

-- One card per type per shop. Before this, nothing stopped a second programme of the same type (a
-- re-run seed made one), but the console only ever showed one: the oldest active programme. Extra
-- programmes nobody holds a card for are dropped. One that customers DO hold can't be dropped, and
-- picking which of two live cards survives isn't a call to make in a migration, so that refuses.
with ranked as (
  select id,
         row_number() over (partition by merchant_id, type order by active desc, created_at, id) as n
    from loyalty_programs
)
delete from loyalty_programs p
 using ranked r
 where p.id = r.id
   and r.n > 1
   and not exists (select 1 from enrollments e where e.program_id = p.id);

do $$
declare
  dup record;
begin
  select merchant_id, type into dup
    from loyalty_programs
   group by merchant_id, type
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'merchant % has a second % programme that customers hold cards on; merge it by hand before migrating',
      dup.merchant_id, dup.type;
  end if;
end
$$;

-- What a shop runs today is the card its console showed: the oldest active programme. That card's
-- type stays on. Any other programme was unreachable from the console (no designer, no poster), so
-- it is frozen rather than suddenly appearing as a second card: its customers keep what they earned.
with current_card as (
  select distinct on (merchant_id) id
    from loyalty_programs
   where active
   order by merchant_id, created_at, id
)
update loyalty_programs
   set status = 'frozen', frozen_at = now()
 where id not in (select id from current_card);

alter table loyalty_programs drop column active;

alter table loyalty_programs
  add constraint loyalty_programs_status_known check (status in ('active', 'frozen')),
  -- frozen_at says when a frozen card was turned off, so it is set exactly when the card is frozen.
  add constraint loyalty_programs_frozen_at_set check ((status = 'frozen') = (frozen_at is not null));

-- The one-per-type rule, enforced where a race between two tabs can't get past it. It also serves
-- the lookup by type that the old non-unique index (0011) was for.
drop index loyalty_programs_merchant_type_idx;
create unique index loyalty_programs_merchant_type_uq on loyalty_programs(merchant_id, type);
