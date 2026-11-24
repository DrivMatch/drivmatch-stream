-- Add public self-registration to the same 20-email/day budget.
-- Data from existing invitations/resends/recovery is retained.
CREATE TABLE stream_email_budget_signup_new (
  request_id TEXT PRIMARY KEY NOT NULL,
  local_day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('invite','resend','recover','public-recover','signup')),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','accepted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO stream_email_budget_signup_new(request_id,local_day,kind,status,created_at)
  SELECT request_id,local_day,kind,status,created_at FROM stream_email_budget;
DROP TABLE stream_email_budget;
ALTER TABLE stream_email_budget_signup_new RENAME TO stream_email_budget;
CREATE INDEX IF NOT EXISTS ix_stream_email_budget_day ON stream_email_budget(local_day);
