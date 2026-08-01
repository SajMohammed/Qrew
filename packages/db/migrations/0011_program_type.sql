-- Qrew 0011 — a programme knows what kind of card it is.
--
-- Until now there was one product: a stamp card. Points, discount and membership cards are coming,
-- and they differ in what a scan is worth, what counts as redeemable, and which wallet class the
-- pass is issued against.
--
-- `type` is the discriminator. `mechanics` holds whatever that type needs and no other type does —
-- a points earn rate, a discount's terms, a membership's tiers — validated in the domain by a zod
-- schema per type. Deliberately jsonb: adding the fifth card type should not need a migration, and
-- the alternative is a table of mostly-null columns, one set per product.
--
-- What did NOT move into mechanics: stamps_required and bonus_stamps. Every progress-based type
-- needs "how much earns a reward" and "what head start do they get", and analytics reads both in
-- SQL, where a jsonb extraction would be slower and lose the column type. They stay columns.
--
-- Existing rows are stamp cards, which is exactly what the default says.

alter table loyalty_programs add column type text not null default 'stamp';
alter table loyalty_programs add column mechanics jsonb not null default '{}'::jsonb;

-- A typo here would issue a pass against the wrong Google class, and that is not fixable after the
-- fact: an object's type is welded to its class, so the pass would have to be re-issued and the
-- customer asked to save it again. Cheaper to refuse the write.
alter table loyalty_programs add constraint loyalty_programs_type_known
  check (type in ('stamp', 'points', 'discount', 'membership'));

-- The dashboard lists a merchant's programmes by type once a shop can run more than one card.
create index loyalty_programs_merchant_type_idx on loyalty_programs(merchant_id, type);
