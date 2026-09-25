-- Remove the change-dot "seen" store. The SectionSeen table held only per-user
-- red-dot acknowledgements for that now-removed feature — no business data. This
-- drops just that table; every other table and row is left untouched.
DROP TABLE IF EXISTS "SectionSeen";
