-- Qrew 0007 — "Guest" was a UI placeholder the card app wrote into customers.name for anonymous
-- enrolls. It's now a display-only fallback (the app no longer sends it). Clear the leaked placeholder
-- for ACCOUNT-LINKED customers so their captured email surfaces on the dashboard instead of "Guest".
-- Anonymous walk-ins are left alone — they render "Guest" via the display fallback regardless.
update customers set name = null where name = 'Guest' and customer_account_id is not null;
