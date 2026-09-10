-- Calendar events pulled automatically in the background, each matched
-- against the activity checklist by keyword. Nothing here becomes a real
-- log_entries row until the user actually reviews and confirms it — this
-- table is a suggestions queue, never an audit-trail substitute itself.
CREATE TABLE outlook_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ms_event_id TEXT NOT NULL,
  subject TEXT,
  event_start TIMESTAMPTZ NOT NULL,
  event_end TIMESTAMPTZ,
  suggested_category_ids JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ms_event_id)
);

CREATE INDEX idx_outlook_suggestions_user_status ON outlook_suggestions(user_id, status);
