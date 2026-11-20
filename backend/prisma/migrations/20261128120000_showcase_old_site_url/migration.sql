-- Website showcases: the old site may also be given as a link (e.g. its
-- web.archive.org copy). Additive only: one new nullable column on the
-- WebsiteShowcase table; no existing rows or values are changed.
ALTER TABLE "WebsiteShowcase" ADD COLUMN "oldSiteUrl" TEXT;
