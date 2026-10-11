-- Qrew 0014 — a short code a cashier can type when the QR won't scan.
--
-- The card serial is a UUID: a fine bearer secret, and useless to read out across a till. The
-- counter's manual box asked for it anyway, and customers never see it. A card now also carries a
-- six-character code from an alphabet with no look-alikes (no 0/O, 1/I/L, and no U), shown under
-- the QR and on the Google pass, unique within the shop.
--
-- It is NOT a capability like the serial. The public card read stays serial-only; the code works
-- only on the scan endpoint, behind the shop's own sign-in and scoped to that shop, so guessing one
-- gives nobody anything they could not already do at that counter. 30^6 (about 729M) codes per
-- shop keeps clashes rare; the unique index catches the rest and enroll simply draws again.

-- Keep the alphabet in step with normalizeShortCode() in packages/core/src/short-code.ts and the
-- format check below. random() is fine: the code is an identifier, not a secret.
create function qrew_short_code() returns text
language sql volatile as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 30)::int, 1), '')
    from generate_series(1, 6)
$$;

alter table enrollments add column short_code text;

-- Backfill one card at a time, drawing again on the rare clash, so creating the unique index below
-- can never fail this migration.
do $$
declare
  r record;
  code text;
begin
  for r in select id, merchant_id from enrollments loop
    loop
      code := qrew_short_code();
      exit when not exists (
        select 1 from enrollments where merchant_id = r.merchant_id and short_code = code
      );
    end loop;
    update enrollments set short_code = code where id = r.id;
  end loop;
end
$$;

alter table enrollments alter column short_code set default qrew_short_code();
alter table enrollments alter column short_code set not null;

-- Stored canonical (upper case, no separator); the app formats it as "K7M 4QX" for display.
alter table enrollments add constraint enrollments_short_code_format
  check (short_code ~ '^[2-9A-HJKMNP-TV-Z]{6}$');

-- Unique per shop (two shops may share a code), and the index the counter's lookup uses.
create unique index enrollments_merchant_short_code_uq on enrollments(merchant_id, short_code);
