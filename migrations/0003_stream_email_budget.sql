-- Isolated DrivMatch Stream daily transactional-email budget.
-- Atomic conditional INSERT protects against parallel Workers oversending.
-- Strict app-level cap: 20 accepted/reserved Supabase email requests per
-- calendar day in America/Sao_Paulo. Not the SMTP provider's quota.
-- No recipient address, access tokens, or email contents stored here.
CREATE TABLE IF NOT EXISTS stream_email_budget (
  request_id TEXT PRIMARY KEY NOT NULL,
  local_day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('invite','resend','recover','public-recover')),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','accepted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS ix_stream_email_budget_day ON stream_email_budget(local_day);
