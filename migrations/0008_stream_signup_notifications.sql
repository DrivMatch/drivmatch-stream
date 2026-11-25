-- Preserve account rows, existing approval states and all transactional email quota entries.
ALTER TABLE stream_users ADD COLUMN signup_notice_state TEXT NOT NULL DEFAULT 'not_requested'
  CHECK(signup_notice_state IN ('not_requested','accepted','failed','uncertain','quota','unconfigured'));
ALTER TABLE stream_users ADD COLUMN decision_notice_state TEXT NOT NULL DEFAULT 'not_requested'
  CHECK(decision_notice_state IN ('not_requested','accepted','failed','uncertain','quota','unconfigured'));
CREATE TABLE stream_email_budget_notice_new (
  request_id TEXT PRIMARY KEY NOT NULL,
  local_day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('invite','resend','recover','public-recover','signup','signup-notice','decision-notice')),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','accepted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO stream_email_budget_notice_new(request_id,local_day,kind,status,created_at)
  SELECT request_id,local_day,kind,status,created_at FROM stream_email_budget;
DROP TABLE stream_email_budget;
ALTER TABLE stream_email_budget_notice_new RENAME TO stream_email_budget;
CREATE INDEX IF NOT EXISTS ix_stream_email_budget_day ON stream_email_budget(local_day);
