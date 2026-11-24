-- Existing viewer/admin accounts retain approved access; new self-signups must be reviewed.
ALTER TABLE stream_users ADD COLUMN approval_state TEXT NOT NULL DEFAULT 'approved'
  CHECK(approval_state IN ('pending','approved','rejected'));
CREATE INDEX IF NOT EXISTS ix_stream_users_approval_state ON stream_users(approval_state,created_at);
