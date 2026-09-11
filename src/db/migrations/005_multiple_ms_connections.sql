-- Supports connecting more than one Microsoft account (e.g. a work account
-- and a personal one). Replaces the single ms_refresh_token_encrypted /
-- ms_connected_at columns on users with a proper one-to-many table.
CREATE TABLE ms_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ms_email TEXT,
  refresh_token_encrypted TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ms_connections_user ON ms_connections(user_id);

-- Carry over any existing single connection so nobody has to reconnect.
INSERT INTO ms_connections (user_id, refresh_token_encrypted, connected_at)
SELECT id, ms_refresh_token_encrypted, COALESCE(ms_connected_at, now())
FROM users
WHERE ms_refresh_token_encrypted IS NOT NULL;

ALTER TABLE users DROP COLUMN ms_refresh_token_encrypted;
ALTER TABLE users DROP COLUMN ms_connected_at;

-- Tag each suggestion with which connection produced it, so the UI can show
-- which account a suggestion came from once there's more than one.
ALTER TABLE outlook_suggestions ADD COLUMN ms_connection_id UUID REFERENCES ms_connections(id) ON DELETE CASCADE;
ALTER TABLE outlook_suggestions DROP CONSTRAINT outlook_suggestions_user_id_ms_event_id_key;
ALTER TABLE outlook_suggestions ADD CONSTRAINT outlook_suggestions_connection_event_key UNIQUE (ms_connection_id, ms_event_id);
