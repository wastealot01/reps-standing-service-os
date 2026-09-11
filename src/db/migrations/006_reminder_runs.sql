-- Guarantees a scheduled reminder (like the weekly digest) only actually
-- sends once per period, even if the background check runs several times
-- during that period. The UNIQUE constraint is what makes this safe: a
-- second attempt to insert the same (reminder_type, period_key) simply
-- fails silently via ON CONFLICT DO NOTHING.
CREATE TABLE reminder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reminder_type, period_key)
);
