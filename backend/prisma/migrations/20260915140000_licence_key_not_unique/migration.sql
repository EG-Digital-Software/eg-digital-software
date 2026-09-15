-- Products assigned together in one action now share a single licence key, so
-- the key can no longer be unique. Dropping the unique index keeps all existing
-- rows and data intact (it only removes a constraint).
DROP INDEX IF EXISTS "Licence_licenceKey_key";
