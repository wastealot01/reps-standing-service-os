-- Stores the Outlook/Microsoft 365 connection per user. Tokens are encrypted
-- at rest with AES-256-GCM (see src/services/crypto.ts) — never stored in
-- plain text, same pattern WasteALot uses for its own OAuth integrations.
ALTER TABLE users ADD COLUMN ms_refresh_token_encrypted TEXT;
ALTER TABLE users ADD COLUMN ms_connected_at TIMESTAMPTZ;
