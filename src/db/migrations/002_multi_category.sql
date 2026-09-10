-- Allows one log entry to be tagged with more than one qualifying activity
-- (e.g. a single site visit that also involved vendor coordination), without
-- multiplying the hours across separate entries.
ALTER TABLE log_entries ADD COLUMN category_ids JSONB;

UPDATE log_entries SET category_ids = jsonb_build_array(category_id) WHERE category_ids IS NULL;

ALTER TABLE log_entries ALTER COLUMN category_ids SET NOT NULL;
ALTER TABLE log_entries DROP COLUMN category_id;
